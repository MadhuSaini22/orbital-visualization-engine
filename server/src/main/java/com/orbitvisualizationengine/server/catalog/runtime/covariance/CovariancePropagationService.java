package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import org.springframework.stereotype.Service;

@Service
public class CovariancePropagationService {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final CovariancePropagationEngine covariancePropagationEngine;

  public CovariancePropagationService(
      RuntimeSatelliteService runtimeSatelliteService,
      CovariancePropagationEngine covariancePropagationEngine) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.covariancePropagationEngine = covariancePropagationEngine;
  }

  public CovariancePropagationResult propagate(CovariancePropagationRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Covariance propagation request is required");
    }
    RuntimeSatellite satellite = runtimeSatelliteService.findByNoradId(request.noradCatalogId());
    return covariancePropagationEngine.propagate(request, satellite);
  }
}
