package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;

public record RuntimeSatelliteResponse(CatalogSatellite catalogSatellite) {
  public static RuntimeSatelliteResponse from(RuntimeSatellite satellite) {
    return new RuntimeSatelliteResponse(satellite.catalogSatellite());
  }
}
