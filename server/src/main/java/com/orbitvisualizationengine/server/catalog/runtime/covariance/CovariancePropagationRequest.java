package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import java.time.Duration;
import java.time.Instant;

public record CovariancePropagationRequest(
    int noradCatalogId,
    Instant startTime,
    Instant stopTime,
    Duration step,
    CovarianceMatrix initialCovariance) {
  public CovariancePropagationRequest {
    if (noradCatalogId <= 0) {
      throw new IllegalArgumentException("NORAD catalog id must be positive");
    }
    if (startTime == null) {
      throw new IllegalArgumentException("Start time is required");
    }
    if (stopTime == null) {
      throw new IllegalArgumentException("Stop time is required");
    }
    if (step == null) {
      throw new IllegalArgumentException("Step duration is required");
    }
    if (stopTime.isBefore(startTime)) {
      throw new IllegalArgumentException("Stop time must be greater than or equal to start time");
    }
    if (step.isZero() || step.isNegative()) {
      throw new IllegalArgumentException("Step duration must be positive");
    }
    if (initialCovariance == null) {
      throw new IllegalArgumentException("Initial covariance is required");
    }
    if (initialCovariance.dimension() != 6) {
      throw new IllegalArgumentException("Initial covariance must be a 6x6 Cartesian covariance matrix");
    }
  }
}
