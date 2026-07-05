package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

public interface PropagationEventDetectorDefinition {
  PropagationEventType eventType();

  default String detectorName() {
    return eventType().name();
  }
}
