package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.util.List;

public record CovariancePropagationResult(
    CovariancePropagationRequest request,
    RuntimeSatellite satellite,
    List<CovarianceState> states) {
  public CovariancePropagationResult {
    if (request == null) {
      throw new IllegalArgumentException("Covariance propagation request is required");
    }
    if (satellite == null) {
      throw new IllegalArgumentException("Runtime satellite is required");
    }
    if (states == null || states.isEmpty()) {
      throw new IllegalArgumentException("At least one covariance state is required");
    }
    states = List.copyOf(states);
  }
}
