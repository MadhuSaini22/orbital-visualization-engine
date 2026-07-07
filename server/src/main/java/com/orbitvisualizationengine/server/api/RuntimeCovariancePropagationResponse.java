package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationRequest;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceState;
import java.util.List;

public record RuntimeCovariancePropagationResponse(
    CovariancePropagationRequest request,
    RuntimeSatelliteResponse satellite,
    List<CovarianceState> states) {
  public static RuntimeCovariancePropagationResponse from(CovariancePropagationResult result) {
    return new RuntimeCovariancePropagationResponse(
        result.request(),
        RuntimeSatelliteResponse.from(result.satellite()),
        result.states());
  }
}
