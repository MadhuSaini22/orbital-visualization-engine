package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

public record RuntimePropagationResponse(
    RuntimeSatelliteResponse satellite,
    Instant startTime,
    Instant stopTime,
    Duration step,
    List<PropagatedState> states) {
  public static RuntimePropagationResponse from(PropagationResult result) {
    return new RuntimePropagationResponse(
        RuntimeSatelliteResponse.from(result.satellite()),
        result.startTime(),
        result.stopTime(),
        result.step(),
        result.states());
  }
}
