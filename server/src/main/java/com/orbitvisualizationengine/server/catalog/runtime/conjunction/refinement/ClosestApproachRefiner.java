package com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;

public interface ClosestApproachRefiner {
  ClosestApproachRefinement refine(RelativeMotionResult relativeMotionResult);
}
