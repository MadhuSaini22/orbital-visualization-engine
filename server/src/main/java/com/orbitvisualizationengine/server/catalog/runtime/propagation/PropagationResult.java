package com.orbitvisualizationengine.server.catalog.runtime.propagation;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

public record PropagationResult(
    RuntimeSatellite satellite,
    Instant startTime,
    Instant stopTime,
    Duration step,
    List<PropagatedState> states) {
  public PropagationResult {
    if (satellite == null) {
      throw new IllegalArgumentException("Runtime satellite is required");
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
    if (states == null || states.isEmpty()) {
      throw new IllegalArgumentException("At least one propagated state is required");
    }
    states = List.copyOf(states);
  }
}
