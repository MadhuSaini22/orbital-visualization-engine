package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement.ClosestApproachRefinementStatistics;

public record ConjunctionResult(
    ConjunctionRequest request,
    ClosestApproach closestApproach,
    ConjunctionStatus status,
    ClosestApproachRefinementStatistics refinementStatistics) {
  public ConjunctionResult(
      ConjunctionRequest request,
      ClosestApproach closestApproach,
      ConjunctionStatus status) {
    this(request, closestApproach, status, new ClosestApproachRefinementStatistics(1, 0, false, 0.0));
  }

  public ConjunctionResult {
    if (request == null) {
      throw new IllegalArgumentException("Conjunction request is required");
    }
    if (closestApproach == null) {
      throw new IllegalArgumentException("Closest approach is required");
    }
    if (status == null) {
      throw new IllegalArgumentException("Conjunction status is required");
    }
    if (refinementStatistics == null) {
      throw new IllegalArgumentException("Closest approach refinement statistics are required");
    }
  }
}
