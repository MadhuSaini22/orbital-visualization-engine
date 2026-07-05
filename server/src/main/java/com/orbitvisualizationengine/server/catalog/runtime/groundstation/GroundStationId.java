package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

public record GroundStationId(String value) {
  public GroundStationId {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("Ground station id is required");
    }
    value = value.trim();
  }
}
