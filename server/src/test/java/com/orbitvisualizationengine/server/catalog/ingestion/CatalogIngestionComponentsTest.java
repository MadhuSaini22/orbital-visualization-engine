package com.orbitvisualizationengine.server.catalog.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.catalog.provider.CatalogCapability;
import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderResponse;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderType;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSourceDescriptor;
import com.orbitvisualizationengine.server.catalog.provider.dto.ProviderTleRecord;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CatalogIngestionComponentsTest {
  private static final String LINE1 = "1 25544U 98067A   24164.51782528  .00016717  00000+0  30135-3 0  9995";
  private static final String LINE2 = "2 25544  51.6416  35.5880 0005217  94.0174  34.5327 15.50011406457333";

  private final CatalogHasher hasher = new CatalogHasher();

  @Test
  void normalizerExtractsTleFieldsAndHash() {
    CatalogNormalizer normalizer = new CatalogNormalizer(hasher);

    List<NormalizedCatalogRecord> records = normalizer.normalize(response(record("ISS (ZARYA)", 25544, LINE1, LINE2)));

    assertEquals(1, records.size());
    NormalizedCatalogRecord record = records.getFirst();
    assertEquals(25544, record.noradCatalogId());
    assertEquals("ISS (ZARYA)", record.objectName());
    assertEquals("U", record.classification());
    assertEquals(1998, record.launchYear());
    assertEquals(67, record.launchNumber());
    assertEquals("A", record.launchPiece());
    assertEquals(Instant.parse("2024-06-12T12:25:40.104192Z"), record.epochAt());
    assertEquals(69, record.tleLine1().length());
    assertEquals(69, record.tleLine2().length());
    assertEquals(hasher.tleSha256(LINE1, LINE2), record.tleSha256());
    assertNotNull(record.sourcePayload());
  }

  @Test
  void validatorRejectsDuplicateNoradIds() {
    CatalogNormalizer normalizer = new CatalogNormalizer(hasher);
    List<NormalizedCatalogRecord> records = normalizer.normalize(response(
        record("ISS (ZARYA)", 25544, LINE1, LINE2),
        record("ISS COPY", 25544, LINE1, LINE2)));

    assertThrows(CatalogValidationException.class, () -> new CatalogValidator().validate(records));
  }

  @Test
  void hasherProducesDeterministicCatalogHashIndependentOfInputOrder() {
    NormalizedCatalogRecord first = normalized(1, "aaa");
    NormalizedCatalogRecord second = normalized(2, "bbb");

    String ordered = hasher.catalogSha256(List.of(first, second));
    String reversed = hasher.catalogSha256(List.of(second, first));

    assertEquals(ordered, reversed);
    assertEquals(64, ordered.length());
  }

  @Test
  void differClassifiesAddedChangedUnchangedAndRemovedRecords() {
    CatalogDiffer differ = new CatalogDiffer();
    NormalizedCatalogRecord added = normalized(1, "new");
    NormalizedCatalogRecord changed = normalized(2, "incoming");
    NormalizedCatalogRecord unchanged = normalized(3, "same");
    List<CurrentCatalogRecord> current = List.of(
        new CurrentCatalogRecord(2, "old", 10, Instant.EPOCH),
        new CurrentCatalogRecord(3, "same", 10, Instant.EPOCH),
        new CurrentCatalogRecord(4, "removed", 10, Instant.EPOCH));

    CatalogDiff diff = differ.diff(List.of(added, changed, unchanged), current);

    assertEquals(List.of(added), diff.added());
    assertEquals(List.of(changed), diff.changed());
    assertEquals(List.of(unchanged), diff.unchanged());
    assertEquals(4, diff.removed().getFirst().noradCatalogId());
  }

  private CatalogProviderResponse<TleCatalogResponse> response(ProviderTleRecord... records) {
    return new CatalogProviderResponse<>(
        descriptor(),
        CatalogEndpoint.GROUP_TLE,
        CatalogDataFormat.TLE,
        Instant.EPOCH,
        new TleCatalogResponse(List.of(records), "raw"));
  }

  private ProviderTleRecord record(String name, int noradId, String line1, String line2) {
    ObjectMapper mapper = new ObjectMapper();
    return new ProviderTleRecord(
        name,
        noradId,
        line1,
        line2,
        mapper.createObjectNode().put("name", name).put("line1", line1).put("line2", line2));
  }

  private CatalogSourceDescriptor descriptor() {
    return new CatalogSourceDescriptor(
        "celestrak",
        "CelesTrak",
        CatalogProviderType.PUBLIC,
        URI.create("https://example.test"),
        Set.of(CatalogCapability.TLE),
        Set.of(CatalogDataFormat.TLE),
        Map.of());
  }

  private NormalizedCatalogRecord normalized(int noradId, String tleSha256) {
    return new NormalizedCatalogRecord(
        noradId,
        "SAT-" + noradId,
        null,
        "payload",
        "U",
        null,
        null,
        null,
        null,
        Instant.EPOCH,
        LINE1,
        LINE2,
        tleSha256,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        new ObjectMapper().createObjectNode());
  }
}
