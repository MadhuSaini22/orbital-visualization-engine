package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.EventDetectionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventDetectorDefinition;
import java.util.List;
import org.orekit.propagation.events.EventDetector;
import org.springframework.stereotype.Component;

@Component
public class EventDetectorFactory {
  private final List<OrekitEventDetectorBuilder> builders;

  public EventDetectorFactory(List<OrekitEventDetectorBuilder> builders) {
    this.builders = List.copyOf(builders);
  }

  public List<EventDetector> createDetectors(
      List<PropagationEventDetectorDefinition> definitions,
      EventCollector collector) {
    return definitions.stream()
        .map(definition -> createDetector(definition, collector))
        .toList();
  }

  private EventDetector createDetector(
      PropagationEventDetectorDefinition definition,
      EventCollector collector) {
    return builders.stream()
        .filter(builder -> builder.supports(definition))
        .findFirst()
        .map(builder -> builder.createDetector(definition, collector))
        .orElseThrow(() -> new EventDetectionException(
            "No Orekit event detector registered for event type " + definition.eventType()));
  }
}
