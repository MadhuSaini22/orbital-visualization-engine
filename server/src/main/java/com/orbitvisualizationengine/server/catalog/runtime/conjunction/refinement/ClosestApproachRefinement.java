package com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;

public record ClosestApproachRefinement(
    ClosestApproach closestApproach,
    ClosestApproachRefinementStatistics statistics) {
  public ClosestApproachRefinement {
    if (closestApproach == null) {
      throw new IllegalArgumentException("Closest approach is required");
    }
    if (statistics == null) {
      throw new IllegalArgumentException("Closest approach refinement statistics are required");
    }
  }
}
