package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.propagation.analytical.tle.TLE;

class OrekitTleFactoryTest {
  private final OrekitTleFactory factory = new OrekitTleFactory();

  @BeforeAll
  static void initOrekit() {
    OrekitTestDataLoader.ensureLoaded();
  }

  @Test
  void createsOrekitTleFromCatalogSatellite() {
    TLE tle = factory.createTle(RuntimeOrekitTestFixtures.catalogSatellite());

    assertThat(tle.getSatelliteNumber()).isEqualTo(25544);
    assertThat(tle.getLine1()).isEqualTo(RuntimeOrekitTestFixtures.ISS_LINE_1);
    assertThat(tle.getLine2()).isEqualTo(RuntimeOrekitTestFixtures.ISS_LINE_2);
  }

  @Test
  void rejectsMissingTleLine() {
    CatalogSatellite satellite = RuntimeOrekitTestFixtures.catalogSatellite(null, RuntimeOrekitTestFixtures.ISS_LINE_2);

    assertThatThrownBy(() -> factory.createTle(satellite))
        .isInstanceOf(InvalidCatalogTleException.class)
        .hasMessageContaining("TLE line 1 is required");
  }

  @Test
  void rejectsWrongLinePrefix() {
    CatalogSatellite satellite = RuntimeOrekitTestFixtures.catalogSatellite(
        "9 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        RuntimeOrekitTestFixtures.ISS_LINE_2);

    assertThatThrownBy(() -> factory.createTle(satellite))
        .isInstanceOf(InvalidCatalogTleException.class)
        .hasMessageContaining("lines must start with '1 ' and '2 '");
  }

  @Test
  void rejectsMismatchedSatelliteNumbers() {
    CatalogSatellite satellite = RuntimeOrekitTestFixtures.catalogSatellite(
        RuntimeOrekitTestFixtures.ISS_LINE_1,
        "2 00005  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554");

    assertThatThrownBy(() -> factory.createTle(satellite))
        .isInstanceOf(InvalidCatalogTleException.class)
        .hasMessageContaining("line satellite numbers do not match");
  }
}
