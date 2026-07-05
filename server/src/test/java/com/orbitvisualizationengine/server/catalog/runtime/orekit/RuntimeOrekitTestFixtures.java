package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.math.BigDecimal;
import java.time.Instant;

final class RuntimeOrekitTestFixtures {
  static final String ISS_LINE_1 =
      "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998";
  static final String ISS_LINE_2 =
      "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554";

  private RuntimeOrekitTestFixtures() {
  }

  static CatalogSatellite catalogSatellite() {
    return catalogSatellite(ISS_LINE_1, ISS_LINE_2);
  }

  static CatalogSatellite catalogSatellite(String line1, String line2) {
    return new CatalogSatellite(
        25544,
        101,
        501,
        "celestrak",
        "CelesTrak",
        "ISS",
        "98067A",
        "payload",
        "U",
        "US",
        1998,
        67,
        "A",
        Instant.parse("2026-05-08T04:47:05.663Z"),
        line1,
        line2,
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        999,
        0,
        new BigDecimal("51.6308"),
        new BigDecimal("138.0417"),
        new BigDecimal("0.0007476"),
        new BigDecimal("35.9089"),
        new BigDecimal("324.2400"),
        new BigDecimal("15.49139257"),
        new BigDecimal("0.00004920"),
        BigDecimal.ZERO,
        new BigDecimal("0.000096926"),
        56555,
        1,
        101,
        Instant.parse("2026-05-08T04:47:05.663Z"),
        Instant.parse("2026-05-08T04:47:05.663Z"));
  }
}
