package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEvent;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventType;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class EventCollector {
  private final List<PropagationEvent> events = new ArrayList<>();

  public void record(
      PropagationEventType type,
      Instant timestamp,
      boolean increasing,
      String detectorName,
      Map<String, String> attributes) {
    events.add(new PropagationEvent(type, timestamp, increasing, detectorName, attributes));
  }

  public List<PropagationEvent> events() {
    return List.copyOf(events);
  }
}
