package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import java.time.Instant;

public record CovarianceState(
    Instant timestamp,
    CovarianceMatrix covarianceMatrix) {
  public CovarianceState {
    if (timestamp == null) {
      throw new IllegalArgumentException("Timestamp is required");
    }
    if (covarianceMatrix == null) {
      throw new IllegalArgumentException("Covariance matrix is required");
    }
  }
}
