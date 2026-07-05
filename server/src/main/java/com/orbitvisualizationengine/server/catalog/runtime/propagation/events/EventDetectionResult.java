package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import java.util.List;

public record EventDetectionResult(
    PropagationResult propagationResult,
    List<PropagationEvent> events) {
  public EventDetectionResult {
    if (propagationResult == null) {
      throw new IllegalArgumentException("Propagation result is required");
    }
    if (events == null) {
      throw new IllegalArgumentException("Propagation events are required");
    }
    events = List.copyOf(events);
  }
}
