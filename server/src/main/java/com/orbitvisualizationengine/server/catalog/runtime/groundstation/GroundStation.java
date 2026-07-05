package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

public record GroundStation(
    GroundStationId id,
    String name,
    GroundStationPosition position,
    GroundStationConfiguration configuration) {
  public GroundStation {
    if (id == null) {
      throw new IllegalArgumentException("Ground station id is required");
    }
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("Ground station name is required");
    }
    name = name.trim();
    if (position == null) {
      throw new IllegalArgumentException("Ground station position is required");
    }
    configuration = configuration == null ? GroundStationConfiguration.empty() : configuration;
  }
}
