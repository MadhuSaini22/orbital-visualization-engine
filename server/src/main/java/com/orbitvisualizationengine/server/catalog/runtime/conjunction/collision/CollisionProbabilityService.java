package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import org.springframework.stereotype.Service;

@Service
public class CollisionProbabilityService {
  private final CollisionProbabilityEngine collisionProbabilityEngine;

  public CollisionProbabilityService(CollisionProbabilityEngine collisionProbabilityEngine) {
    this.collisionProbabilityEngine = collisionProbabilityEngine;
  }

  public CollisionProbabilityResult compute(CollisionProbabilityRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Collision probability request is required");
    }
    return collisionProbabilityEngine.compute(request);
  }
}
