package com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.config.GroundStationProperties;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.mapper.GroundStationMapper;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.springframework.stereotype.Repository;

@Repository
public class ConfiguredGroundStationRepository implements GroundStationRepository {
  private final Map<GroundStationId, GroundStation> stationsById;

  public ConfiguredGroundStationRepository(
      GroundStationProperties properties,
      GroundStationMapper mapper) {
    Map<GroundStationId, GroundStation> stations = new LinkedHashMap<>();
    for (GroundStationProperties.Station station : properties.getStations()) {
      GroundStation groundStation = mapper.toGroundStation(station);
      if (stations.putIfAbsent(groundStation.id(), groundStation) != null) {
        throw new IllegalArgumentException(
            "Duplicate ground station id configured: " + groundStation.id().value());
      }
    }
    this.stationsById = Collections.unmodifiableMap(stations);
  }

  @Override
  public Optional<GroundStation> findById(GroundStationId id) {
    return Optional.ofNullable(stationsById.get(id));
  }

  @Override
  public List<GroundStation> findAll() {
    return List.copyOf(stationsById.values());
  }

  @Override
  public boolean exists(GroundStationId id) {
    return stationsById.containsKey(id);
  }

  @Override
  public Stream<GroundStation> stream() {
    return stationsById.values().stream();
  }
}
