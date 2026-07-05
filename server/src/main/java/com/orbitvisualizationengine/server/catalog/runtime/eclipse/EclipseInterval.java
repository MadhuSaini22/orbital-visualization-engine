package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import java.time.Duration;
import java.time.Instant;

public record EclipseInterval(
    EclipseType type,
    Instant startTime,
    Instant stopTime,
    Duration duration) {
  public EclipseInterval {
    if (type == null) {
      throw new IllegalArgumentException("Eclipse type is required");
    }
    if (startTime == null) {
      throw new IllegalArgumentException("Start time is required");
    }
    if (stopTime == null) {
      throw new IllegalArgumentException("Stop time is required");
    }
    if (stopTime.isBefore(startTime)) {
      throw new IllegalArgumentException("Stop time must be greater than or equal to start time");
    }
    Duration computedDuration = Duration.between(startTime, stopTime);
    if (duration == null) {
      duration = computedDuration;
    }
    if (!duration.equals(computedDuration)) {
      throw new IllegalArgumentException("Duration must match the interval time span");
    }
  }
}
