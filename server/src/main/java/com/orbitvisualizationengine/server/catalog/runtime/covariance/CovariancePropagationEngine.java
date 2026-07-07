package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;

public interface CovariancePropagationEngine {
  CovariancePropagationResult propagate(
      CovariancePropagationRequest request,
      RuntimeSatellite satellite);
}
