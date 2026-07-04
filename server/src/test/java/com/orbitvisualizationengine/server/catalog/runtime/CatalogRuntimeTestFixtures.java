package com.orbitvisualizationengine.server.catalog.runtime;

import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogSatelliteRecord;
import java.math.BigDecimal;
import java.time.Instant;

final class CatalogRuntimeTestFixtures {
  private CatalogRuntimeTestFixtures() {
  }

  static CatalogSatelliteRecord record(int noradCatalogId, String objectName) {
    return new CatalogSatelliteRecord(
        noradCatalogId,
        101,
        501,
        "celestrak",
        "CelesTrak",
        objectName,
        "98067A",
        "payload",
        "U",
        "US",
        1998,
        67,
        "A",
        Instant.parse("2024-06-12T12:25:40.104192Z"),
        "1 25544U 98067A   24164.51782528  .00016717  00000+0  10270-3 0  9009",
        "2 25544  51.6395  71.2445 0006703  73.8296 286.3427 15.50012345 12345",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        900,
        0,
        new BigDecimal("51.6395"),
        new BigDecimal("71.2445"),
        new BigDecimal("0.0006703"),
        new BigDecimal("73.8296"),
        new BigDecimal("286.3427"),
        new BigDecimal("15.50012345"),
        new BigDecimal("0.00016717"),
        BigDecimal.ZERO,
        new BigDecimal("0.00010270"),
        12345,
        1,
        101,
        Instant.parse("2024-06-01T00:00:00Z"),
        Instant.parse("2024-06-12T13:00:00Z"));
  }
}
