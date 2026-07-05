package com.orbitvisualizationengine.server.catalog.runtime.propagation;

import java.time.Instant;

public record PropagatedState(
    Instant timestamp,
    String frameName,
    CartesianVector position,
    CartesianVector velocity) {
  public PropagatedState {
    if (timestamp == null) {
      throw new IllegalArgumentException("Timestamp is required");
    }
    if (frameName == null || frameName.isBlank()) {
      throw new IllegalArgumentException("Frame name is required");
    }
    if (position == null) {
      throw new IllegalArgumentException("Position is required");
    }
    if (velocity == null) {
      throw new IllegalArgumentException("Velocity is required");
    }
  }
}
