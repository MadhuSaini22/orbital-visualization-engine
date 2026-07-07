package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

public interface CollisionProbabilityEngine {
  CollisionProbabilityResult compute(CollisionProbabilityRequest request);
}
