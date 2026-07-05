package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

import java.util.Map;

public record GroundStationConfiguration(
    Map<String, String> attributes) {
  public GroundStationConfiguration {
    attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
  }

  public static GroundStationConfiguration empty() {
    return new GroundStationConfiguration(Map.of());
  }
}
