package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;

public interface VisibilityEngine {
  VisibilityResult computeVisibility(
      VisibilityRequest request,
      RuntimeSatellite satellite,
      GroundStation groundStation,
      PropagationResult propagationResult);
}
