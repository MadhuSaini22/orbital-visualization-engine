package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;

public interface RelativeMotionEngine {
  RelativeMotionResult computeRelativeMotion(
      RelativeMotionRequest request,
      PropagationResult primaryPropagation,
      PropagationResult secondaryPropagation);
}
