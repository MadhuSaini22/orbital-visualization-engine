package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GroundStationModelTest {
  @Test
  void trimsRequiredIdentityFields() {
    GroundStation station = new GroundStation(
        new GroundStationId("  goldstone  "),
        "  Goldstone DSS-14  ",
        new GroundStationPosition(35.2472, -116.7933, 1006.0),
        null);

    assertThat(station.id().value()).isEqualTo("goldstone");
    assertThat(station.name()).isEqualTo("Goldstone DSS-14");
    assertThat(station.configuration().attributes()).isEmpty();
  }

  @Test
  void validatesGeodeticPosition() {
    assertThatThrownBy(() -> new GroundStationPosition(91.0, 0.0, 0.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Latitude");

    assertThatThrownBy(() -> new GroundStationPosition(0.0, -181.0, 0.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Longitude");

    assertThatThrownBy(() -> new GroundStationPosition(0.0, 0.0, Double.NaN))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Altitude");
  }

  @Test
  void configurationDefensivelyCopiesAttributes() {
    Map<String, String> attributes = new LinkedHashMap<>();
    attributes.put("network", "dsn");

    GroundStationConfiguration configuration = new GroundStationConfiguration(attributes);
    attributes.put("band", "x");

    assertThat(configuration.attributes()).containsOnly(Map.entry("network", "dsn"));
    assertThatThrownBy(() -> configuration.attributes().put("band", "ka"))
        .isInstanceOf(UnsupportedOperationException.class);
  }
}
