package com.orbitvisualizationengine.server.catalog.runtime.groundstation.mapper;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationConfiguration;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationPosition;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.config.GroundStationProperties;
import org.springframework.stereotype.Component;

@Component
public class GroundStationMapper {
  public GroundStation toGroundStation(GroundStationProperties.Station station) {
    if (station == null) {
      throw new IllegalArgumentException("Ground station source record is required");
    }
    return new GroundStation(
        new GroundStationId(station.getId()),
        station.getName(),
        new GroundStationPosition(
            station.getLatitudeDegrees(),
            station.getLongitudeDegrees(),
            station.getAltitudeMeters()),
        new GroundStationConfiguration(station.getAttributes()));
  }
}
