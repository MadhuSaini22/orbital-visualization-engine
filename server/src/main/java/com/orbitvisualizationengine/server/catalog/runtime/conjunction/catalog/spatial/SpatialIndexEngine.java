package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;

public interface SpatialIndexEngine {
  SpatialCandidateResult findCandidates(CatalogSatellite primarySatellite);
}
