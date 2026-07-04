package com.orbitvisualizationengine.server.catalog.ingestion;

import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderResponse;
import com.orbitvisualizationengine.server.catalog.provider.dto.ProviderTleRecord;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderResponseException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class CatalogNormalizer {
  private final CatalogHasher hasher;

  public CatalogNormalizer(CatalogHasher hasher) {
    this.hasher = hasher;
  }

  public List<NormalizedCatalogRecord> normalize(CatalogProviderResponse<?> response) {
    if (!(response.body() instanceof TleCatalogResponse tleResponse)) {
      throw new ProviderResponseException(response.source().code(), "Ingestion currently requires a TLE provider response");
    }

    List<NormalizedCatalogRecord> records = new ArrayList<>();
    for (ProviderTleRecord record : tleResponse.records()) {
      records.add(normalize(response.source().code(), record));
    }
    return records;
  }

  private NormalizedCatalogRecord normalize(String providerCode, ProviderTleRecord record) {
    String line1 = record.line1().trim();
    String line2 = record.line2().trim();
    return new NormalizedCatalogRecord(
        record.noradCatalogId(),
        blankToNull(record.objectName()),
        objectId(line1),
        "payload",
        charAt(line1, 7),
        null,
        launchYear(providerCode, line1),
        integer(providerCode, line1, 11, 14),
        blankToNull(slice(line1, 14, 17)),
        epoch(providerCode, line1),
        line1,
        line2,
        hasher.tleSha256(line1, line2),
        integer(providerCode, line1, 64, 68),
        integer(providerCode, line1, 62, 63),
        decimal(providerCode, line2, 8, 16),
        decimal(providerCode, line2, 17, 25),
        eccentricity(providerCode, line2),
        decimal(providerCode, line2, 34, 42),
        decimal(providerCode, line2, 43, 51),
        decimal(providerCode, line2, 52, 63),
        decimal(providerCode, line1, 33, 43),
        tleExponential(providerCode, line1, 44, 52),
        tleExponential(providerCode, line1, 53, 61),
        integer(providerCode, line2, 63, 68),
        record.rawPayload());
  }

  private Instant epoch(String providerCode, String line1) {
    try {
      int twoDigitYear = Integer.parseInt(slice(line1, 18, 20));
      BigDecimal dayOfYear = new BigDecimal(slice(line1, 20, 32));
      int year = twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
      long wholeDays = dayOfYear.longValue();
      BigDecimal fractionalDay = dayOfYear.subtract(BigDecimal.valueOf(wholeDays));
      long nanos = fractionalDay
          .multiply(BigDecimal.valueOf(86_400_000_000_000L))
          .setScale(0, RoundingMode.HALF_UP)
          .longValueExact();
      return LocalDate.of(year, 1, 1)
          .plusDays(Math.max(0, wholeDays - 1))
          .atStartOfDay()
          .plusNanos(nanos)
          .toInstant(ZoneOffset.UTC);
    } catch (RuntimeException exception) {
      throw new ProviderResponseException(providerCode, "Unable to parse TLE epoch", exception);
    }
  }

  private Integer launchYear(String providerCode, String line1) {
    Integer twoDigitYear = integer(providerCode, line1, 9, 11);
    if (twoDigitYear == null) {
      return null;
    }
    return twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
  }

  private String objectId(String line1) {
    String launchYear = slice(line1, 9, 11);
    String launchNumber = slice(line1, 11, 14);
    String launchPiece = slice(line1, 14, 17);
    if (launchYear.isBlank() || launchNumber.isBlank()) {
      return null;
    }
    return launchYear.trim() + launchNumber.trim() + launchPiece.trim();
  }

  private BigDecimal eccentricity(String providerCode, String line2) {
    String value = slice(line2, 26, 33);
    return value.isBlank() ? null : new BigDecimal("0." + value.trim());
  }

  private BigDecimal decimal(String providerCode, String line, int start, int end) {
    String value = slice(line, start, end);
    if (value.isBlank()) {
      return null;
    }
    try {
      return new BigDecimal(value.trim());
    } catch (RuntimeException exception) {
      throw new ProviderResponseException(providerCode, "Unable to parse decimal field from TLE", exception);
    }
  }

  private BigDecimal tleExponential(String providerCode, String line, int start, int end) {
    String value = slice(line, start, end).trim();
    if (value.isBlank()) {
      return null;
    }
    try {
      String mantissaSign = value.startsWith("-") ? "-" : "";
      String digits = value.substring(value.startsWith("-") || value.startsWith("+") ? 1 : 0, value.length() - 2);
      String exponent = value.substring(value.length() - 2);
      return new BigDecimal(mantissaSign + "0." + digits + "E" + exponent);
    } catch (RuntimeException exception) {
      throw new ProviderResponseException(providerCode, "Unable to parse TLE exponential field", exception);
    }
  }

  private Integer integer(String providerCode, String line, int start, int end) {
    String value = slice(line, start, end);
    if (value.isBlank()) {
      return null;
    }
    try {
      return Integer.parseInt(value.trim());
    } catch (RuntimeException exception) {
      throw new ProviderResponseException(providerCode, "Unable to parse integer field from TLE", exception);
    }
  }

  private String charAt(String line, int index) {
    return index < line.length() && !Character.isWhitespace(line.charAt(index))
        ? String.valueOf(line.charAt(index))
        : null;
  }

  private String slice(String value, int start, int end) {
    if (value == null || value.length() <= start) {
      return "";
    }
    return value.substring(start, Math.min(end, value.length())).trim();
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
