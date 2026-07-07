package com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement;

public record ClosestApproachRefinementStatistics(
    int sampledStatesExamined,
    int sampledMinimumIndex,
    boolean refined,
    double refinementOffsetSeconds) {
  public ClosestApproachRefinementStatistics {
    if (sampledStatesExamined <= 0) {
      throw new IllegalArgumentException("Sampled states examined must be positive");
    }
    if (sampledMinimumIndex < 0 || sampledMinimumIndex >= sampledStatesExamined) {
      throw new IllegalArgumentException("Sampled minimum index must refer to an examined state");
    }
    if (!Double.isFinite(refinementOffsetSeconds)) {
      throw new IllegalArgumentException("Refinement offset must be finite");
    }
  }

  public static ClosestApproachRefinementStatistics notRefined(
      int sampledStatesExamined,
      int sampledMinimumIndex) {
    return new ClosestApproachRefinementStatistics(sampledStatesExamined, sampledMinimumIndex, false, 0.0);
  }
}
