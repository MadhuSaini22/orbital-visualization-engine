package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.config.GroundStationProperties;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.mapper.GroundStationMapper;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository.ConfiguredGroundStationRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GroundStationRepositoryTest {
  private final GroundStationMapper mapper = new GroundStationMapper();

  @Test
  void loadsStationsFromConfigurationProperties() {
    ConfiguredGroundStationRepository repository = new ConfiguredGroundStationRepository(
        properties(station("goldstone", "Goldstone DSS-14")),
        mapper);

    GroundStation station = repository.findById(new GroundStationId("goldstone")).orElseThrow();

    assertThat(station.name()).isEqualTo("Goldstone DSS-14");
    assertThat(station.position().latitudeDegrees()).isEqualTo(35.2472);
    assertThat(station.configuration().attributes()).containsEntry("network", "dsn");
    assertThat(repository.findAll()).containsExactly(station);
    assertThat(repository.exists(new GroundStationId("goldstone"))).isTrue();
  }

  @Test
  void rejectsDuplicateConfiguredStationIds() {
    GroundStationProperties properties = properties(
        station("goldstone", "Goldstone A"),
        station("goldstone", "Goldstone B"));

    assertThatThrownBy(() -> new ConfiguredGroundStationRepository(properties, mapper))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Duplicate ground station id configured: goldstone");
  }

  private static GroundStationProperties properties(GroundStationProperties.Station... stations) {
    GroundStationProperties properties = new GroundStationProperties();
    properties.setStations(List.of(stations));
    return properties;
  }

  private static GroundStationProperties.Station station(String id, String name) {
    GroundStationProperties.Station station = new GroundStationProperties.Station();
    station.setId(id);
    station.setName(name);
    station.setLatitudeDegrees(35.2472);
    station.setLongitudeDegrees(-116.7933);
    station.setAltitudeMeters(1006.0);
    station.setAttributes(Map.of("network", "dsn"));
    return station;
  }
}
