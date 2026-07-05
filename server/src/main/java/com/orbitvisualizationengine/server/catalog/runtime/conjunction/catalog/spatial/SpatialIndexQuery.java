package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;

public record SpatialIndexQuery(CatalogSatellite primarySatellite) {
  public SpatialIndexQuery {
    if (primarySatellite == null) {
      throw new IllegalArgumentException("Primary satellite is required");
    }
  }
}
