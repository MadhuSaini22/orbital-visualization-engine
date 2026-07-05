package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import java.time.Duration;
import java.time.Instant;

public record VisibilityWindow(
    Instant acquisitionOfSignalTime,
    Instant lossOfSignalTime,
    Instant maximumElevationTime,
    double maximumElevationDegrees,
    Duration duration) {
  public VisibilityWindow {
    if (acquisitionOfSignalTime == null) {
      throw new IllegalArgumentException("Acquisition of signal time is required");
    }
    if (lossOfSignalTime == null) {
      throw new IllegalArgumentException("Loss of signal time is required");
    }
    if (maximumElevationTime == null) {
      throw new IllegalArgumentException("Maximum elevation time is required");
    }
    if (lossOfSignalTime.isBefore(acquisitionOfSignalTime)) {
      throw new IllegalArgumentException("Loss of signal time must be after acquisition of signal time");
    }
    if (maximumElevationTime.isBefore(acquisitionOfSignalTime)
        || maximumElevationTime.isAfter(lossOfSignalTime)) {
      throw new IllegalArgumentException("Maximum elevation time must fall inside the visibility window");
    }
    if (!Double.isFinite(maximumElevationDegrees)) {
      throw new IllegalArgumentException("Maximum elevation must be finite");
    }
    if (duration == null) {
      duration = Duration.between(acquisitionOfSignalTime, lossOfSignalTime);
    }
    if (duration.isNegative()) {
      throw new IllegalArgumentException("Visibility duration must not be negative");
    }
  }
}
