package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;

public record SpatialCandidate(CatalogSatellite satellite) {
  public SpatialCandidate {
    if (satellite == null) {
      throw new IllegalArgumentException("Spatial candidate satellite is required");
    }
  }
}
