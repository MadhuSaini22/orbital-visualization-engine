package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

public record ConjunctionResult(
    ConjunctionRequest request,
    ClosestApproach closestApproach,
    ConjunctionStatus status) {
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
  }
}
