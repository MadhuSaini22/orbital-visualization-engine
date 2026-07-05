package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

import java.time.Instant;
import java.util.Map;

public record PropagationEvent(
    PropagationEventType type,
    Instant timestamp,
    boolean increasing,
    String detectorName,
    Map<String, String> attributes) {
  public PropagationEvent {
    if (type == null) {
      throw new IllegalArgumentException("Propagation event type is required");
    }
    if (timestamp == null) {
      throw new IllegalArgumentException("Propagation event timestamp is required");
    }
    if (detectorName == null || detectorName.isBlank()) {
      throw new IllegalArgumentException("Detector name is required");
    }
    attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
  }
}
