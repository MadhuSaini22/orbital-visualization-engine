package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;

public interface EclipseEngine {
  EclipseResult computeEclipses(EclipseRequest request, PropagationResult propagationResult);
}
