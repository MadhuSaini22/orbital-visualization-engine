package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import java.time.Duration;
import java.time.Instant;

public record ConjunctionRequest(
    int primaryNoradCatalogId,
    int secondaryNoradCatalogId,
    Instant startTime,
    Instant stopTime,
    Duration step,
    RelativeFrame relativeFrame,
    double missDistanceThresholdMeters) {
  public ConjunctionRequest {
    if (primaryNoradCatalogId <= 0) {
      throw new IllegalArgumentException("Primary NORAD catalog id must be positive");
    }
    if (secondaryNoradCatalogId <= 0) {
      throw new IllegalArgumentException("Secondary NORAD catalog id must be positive");
    }
    if (primaryNoradCatalogId == secondaryNoradCatalogId) {
      throw new IllegalArgumentException("Primary and secondary satellites must be different");
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
    if (relativeFrame == null) {
      relativeFrame = RelativeFrame.LVLH_RTN;
    }
    if (!Double.isFinite(missDistanceThresholdMeters)) {
      throw new IllegalArgumentException("Miss-distance threshold must be finite");
    }
    if (missDistanceThresholdMeters < 0.0) {
      throw new IllegalArgumentException("Miss-distance threshold must be non-negative");
    }
  }
}
