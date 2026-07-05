package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.time.Instant;

public record ClosestApproach(
    Instant timeOfClosestApproach,
    double missDistanceMeters,
    double relativeSpeedMetersPerSecond,
    RelativeState relativeState) {
  public ClosestApproach {
    if (timeOfClosestApproach == null) {
      throw new IllegalArgumentException("Time of closest approach is required");
    }
    if (!Double.isFinite(missDistanceMeters)) {
      throw new IllegalArgumentException("Miss distance must be finite");
    }
    if (missDistanceMeters < 0.0) {
      throw new IllegalArgumentException("Miss distance must be non-negative");
    }
    if (!Double.isFinite(relativeSpeedMetersPerSecond)) {
      throw new IllegalArgumentException("Relative speed must be finite");
    }
    if (relativeSpeedMetersPerSecond < 0.0) {
      throw new IllegalArgumentException("Relative speed must be non-negative");
    }
    if (relativeState == null) {
      throw new IllegalArgumentException("Closest relative state is required");
    }
    if (!timeOfClosestApproach.equals(relativeState.timestamp())) {
      throw new IllegalArgumentException("Time of closest approach must match the relative state timestamp");
    }
  }
}
