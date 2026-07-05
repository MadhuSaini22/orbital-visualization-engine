package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;

public interface ConjunctionEngine {
  ConjunctionResult analyze(ConjunctionRequest request, RelativeMotionResult relativeMotionResult);
}
