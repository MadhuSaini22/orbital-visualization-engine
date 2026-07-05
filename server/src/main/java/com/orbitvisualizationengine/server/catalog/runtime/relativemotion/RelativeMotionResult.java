package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import java.util.List;

public record RelativeMotionResult(
    RelativeMotionRequest request,
    List<RelativeState> states) {
  public RelativeMotionResult {
    if (request == null) {
      throw new IllegalArgumentException("Relative motion request is required");
    }
    if (states == null || states.isEmpty()) {
      throw new IllegalArgumentException("At least one relative state is required");
    }
    states = List.copyOf(states);
  }
}
