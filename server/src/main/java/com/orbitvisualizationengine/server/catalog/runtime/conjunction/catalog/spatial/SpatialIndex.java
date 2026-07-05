package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

public interface SpatialIndex {
  SpatialCandidateResult query(SpatialIndexQuery query);
}
