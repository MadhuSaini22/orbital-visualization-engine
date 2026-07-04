package com.orbitvisualizationengine.server.catalog.ingestion;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class CatalogValidator {
  public void validate(List<NormalizedCatalogRecord> records) {
    if (records.isEmpty()) {
      throw new CatalogValidationException("Provider response did not contain any catalog records");
    }

    Set<Integer> noradIds = new HashSet<>();
    for (NormalizedCatalogRecord record : records) {
      validateRecord(record);
      if (!noradIds.add(record.noradCatalogId())) {
        throw new CatalogValidationException("Duplicate NORAD catalog ID in provider response: " + record.noradCatalogId());
      }
    }
  }

  private void validateRecord(NormalizedCatalogRecord record) {
    if (record.noradCatalogId() <= 0) {
      throw new CatalogValidationException("NORAD catalog ID must be positive");
    }
    if (record.objectName() == null || record.objectName().isBlank()) {
      throw new CatalogValidationException("Object name is required for NORAD " + record.noradCatalogId());
    }
    if (record.epochAt() == null || record.epochAt().isBefore(Instant.parse("1957-10-04T00:00:00Z"))) {
      throw new CatalogValidationException("Invalid TLE epoch for NORAD " + record.noradCatalogId());
    }
    if (record.tleLine1() == null || record.tleLine2() == null
        || record.tleLine1().length() != 69
        || record.tleLine2().length() != 69
        || !record.tleLine1().startsWith("1 ")
        || !record.tleLine2().startsWith("2 ")) {
      throw new CatalogValidationException("Malformed TLE lines for NORAD " + record.noradCatalogId());
    }
    if (record.tleSha256() == null || !record.tleSha256().matches("^[0-9a-f]{64}$")) {
      throw new CatalogValidationException("Invalid TLE SHA-256 for NORAD " + record.noradCatalogId());
    }
  }
}
