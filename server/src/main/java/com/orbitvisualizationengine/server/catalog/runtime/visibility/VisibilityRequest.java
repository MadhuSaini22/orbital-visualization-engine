package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import java.time.Duration;
import java.time.Instant;

public record VisibilityRequest(
    int noradCatalogId,
    GroundStationId groundStationId,
    Instant startTime,
    Instant stopTime,
    Duration step,
    double minimumElevationDegrees) {
  public VisibilityRequest {
    if (noradCatalogId <= 0) {
      throw new IllegalArgumentException("NORAD catalog id must be positive");
    }
    if (groundStationId == null) {
      throw new IllegalArgumentException("Ground station id is required");
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
    if (!Double.isFinite(minimumElevationDegrees)) {
      throw new IllegalArgumentException("Minimum elevation must be finite");
    }
    if (minimumElevationDegrees < -90.0 || minimumElevationDegrees > 90.0) {
      throw new IllegalArgumentException("Minimum elevation must be between -90 and 90 degrees");
    }
  }
}
