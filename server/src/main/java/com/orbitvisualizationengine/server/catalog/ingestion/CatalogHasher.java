package com.orbitvisualizationengine.server.catalog.ingestion;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class CatalogHasher {
  public String tleSha256(String line1, String line2) {
    return sha256(line1.trim() + "\n" + line2.trim());
  }

  public String catalogSha256(List<NormalizedCatalogRecord> records) {
    String normalizedCatalog = records.stream()
        .sorted(Comparator.comparingInt(NormalizedCatalogRecord::noradCatalogId))
        .map(record -> record.noradCatalogId() + ":" + record.tleSha256())
        .collect(Collectors.joining("\n"));
    return sha256(normalizedCatalog);
  }

  private String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (RuntimeException | java.security.GeneralSecurityException exception) {
      throw new IllegalStateException("Unable to compute SHA-256", exception);
    }
  }
}
