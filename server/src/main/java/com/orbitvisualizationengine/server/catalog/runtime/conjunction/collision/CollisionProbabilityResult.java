package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

public record CollisionProbabilityResult(
    CollisionProbabilityRequest request,
    double probabilityOfCollision,
    CollisionProbabilityStatistics statistics) {
  public CollisionProbabilityResult {
    if (request == null) {
      throw new IllegalArgumentException("Collision probability request is required");
    }
    if (!Double.isFinite(probabilityOfCollision)) {
      throw new IllegalArgumentException("Probability of collision must be finite");
    }
    if (probabilityOfCollision < 0.0 || probabilityOfCollision > 1.0) {
      throw new IllegalArgumentException("Probability of collision must be between 0 and 1");
    }
    if (statistics == null) {
      throw new IllegalArgumentException("Collision probability statistics are required");
    }
  }
}
