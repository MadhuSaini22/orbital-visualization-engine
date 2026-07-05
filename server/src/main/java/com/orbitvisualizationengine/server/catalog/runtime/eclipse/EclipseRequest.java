package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import java.time.Duration;
import java.time.Instant;

public record EclipseRequest(
    int noradCatalogId,
    Instant startTime,
    Instant stopTime,
    Duration step) {
  public EclipseRequest {
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
  }
}
