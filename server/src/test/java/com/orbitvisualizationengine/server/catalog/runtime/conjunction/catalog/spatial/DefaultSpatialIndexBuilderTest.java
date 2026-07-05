package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class DefaultSpatialIndexBuilderTest {
  @Test
  void returnsNearbyOrbitalBinsAndFallbackRows() {
    CatalogSatellite primary = satellite(25544, "51.6", "138.0", "15.49");
    CatalogSatellite nearby = satellite(10001, "52.0", "140.0", "15.10");
    CatalogSatellite fallback = satellite(10002, null, null, null);
    CatalogSatellite distant = satellite(10003, "10.0", "300.0", "2.0");
    SpatialIndex index = new DefaultSpatialIndexBuilder().build(
        List.of(primary, nearby, fallback, distant).stream());

    SpatialCandidateResult result = index.query(new SpatialIndexQuery(primary));

    assertThat(result.satellites())
        .extracting(CatalogSatellite::noradCatalogId)
        .containsExactlyInAnyOrder(10001, 10002);
    assertThat(result.spatialCandidatesSeen()).isEqualTo(3);
    assertThat(result.skippedPrimarySatellites()).isEqualTo(1);
  }

  @Test
  void primaryWithoutIndexedElementsFallsBackToAllCatalogSatellites() {
    CatalogSatellite primary = satellite(25544, null, null, null);
    CatalogSatellite first = satellite(10001, "52.0", "140.0", "15.10");
    CatalogSatellite second = satellite(10002, "10.0", "300.0", "2.0");
    SpatialIndex index = new DefaultSpatialIndexBuilder().build(
        List.of(primary, first, second).stream());

    SpatialCandidateResult result = index.query(new SpatialIndexQuery(primary));

    assertThat(result.satellites())
        .extracting(CatalogSatellite::noradCatalogId)
        .containsExactlyInAnyOrder(10001, 10002);
    assertThat(result.spatialCandidatesSeen()).isEqualTo(3);
    assertThat(result.skippedPrimarySatellites()).isEqualTo(1);
  }

  static CatalogSatellite satellite(
      int noradCatalogId,
      String inclinationDeg,
      String raanDeg,
      String meanMotionRevPerDay) {
    return new CatalogSatellite(
        noradCatalogId,
        101,
        501,
        "test-source",
        "Test Source",
        "SAT-" + noradCatalogId,
        "1998-067A",
        "payload",
        "U",
        "US",
        1998,
        67,
        "A",
        ConjunctionModelTest.START,
        "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        999,
        0,
        decimal(inclinationDeg),
        decimal(raanDeg),
        BigDecimal.valueOf(0.0007476),
        BigDecimal.valueOf(35.9089),
        BigDecimal.valueOf(324.2400),
        decimal(meanMotionRevPerDay),
        null,
        null,
        null,
        56555,
        1,
        101,
        ConjunctionModelTest.START,
        ConjunctionModelTest.START);
  }

  private static BigDecimal decimal(String value) {
    return value == null ? null : new BigDecimal(value);
  }
}
