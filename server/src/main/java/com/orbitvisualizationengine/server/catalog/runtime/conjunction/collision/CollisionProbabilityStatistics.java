package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

public record CollisionProbabilityStatistics(
    CollisionProbabilityMethod method,
    double combinedEncounterPlaneVarianceMetersSquared,
    double equivalentSigmaMeters,
    double normalizedMissDistance,
    double normalizedHardBodyRadius) {
  public CollisionProbabilityStatistics {
    if (method == null) {
      throw new IllegalArgumentException("Collision probability method is required");
    }
    requireFiniteNonNegative(combinedEncounterPlaneVarianceMetersSquared, "Combined encounter-plane variance");
    requireFiniteNonNegative(equivalentSigmaMeters, "Equivalent sigma");
    requireFiniteNonNegative(normalizedMissDistance, "Normalized miss distance");
    requireFiniteNonNegative(normalizedHardBodyRadius, "Normalized hard-body radius");
  }

  private static void requireFiniteNonNegative(double value, String name) {
    if (!Double.isFinite(value)) {
      throw new IllegalArgumentException(name + " must be finite");
    }
    if (value < 0.0) {
      throw new IllegalArgumentException(name + " must be non-negative");
    }
  }
}
