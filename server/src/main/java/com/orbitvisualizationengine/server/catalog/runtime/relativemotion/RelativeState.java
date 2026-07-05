package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import java.time.Instant;

public record RelativeState(
    Instant timestamp,
    RelativeFrame frame,
    CartesianVector relativePosition,
    CartesianVector relativeVelocity) {
  public RelativeState {
    if (timestamp == null) {
      throw new IllegalArgumentException("Timestamp is required");
    }
    if (frame == null) {
      throw new IllegalArgumentException("Relative frame is required");
    }
    if (relativePosition == null) {
      throw new IllegalArgumentException("Relative position is required");
    }
    if (relativeVelocity == null) {
      throw new IllegalArgumentException("Relative velocity is required");
    }
  }
}
