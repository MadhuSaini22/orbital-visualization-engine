package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service("runtimeEventDetectionService")
public class EventDetectionService {
  private final PropagationService propagationService;
  private final EventDetectionEngine eventDetectionEngine;

  public EventDetectionService(
      PropagationService propagationService,
      EventDetectionEngine eventDetectionEngine) {
    this.propagationService = propagationService;
    this.eventDetectionEngine = eventDetectionEngine;
  }

  public EventDetectionResult detectEvents(
      RuntimeSatellite satellite,
      Instant startTime,
      Instant stopTime,
      Duration step,
      List<PropagationEventDetectorDefinition> detectorDefinitions) {
    List<PropagationEventDetectorDefinition> definitions = validate(detectorDefinitions);
    PropagationResult propagationResult = propagationService.propagate(satellite, startTime, stopTime, step);
    List<PropagationEvent> events = eventDetectionEngine.detect(satellite, startTime, stopTime, definitions);
    return new EventDetectionResult(propagationResult, events);
  }

  private static List<PropagationEventDetectorDefinition> validate(
      List<PropagationEventDetectorDefinition> detectorDefinitions) {
    if (detectorDefinitions == null) {
      return List.of();
    }
    for (PropagationEventDetectorDefinition definition : detectorDefinitions) {
      if (definition == null) {
        throw new EventDetectionRequestException("Event detector definitions must not contain null entries");
      }
    }
    return List.copyOf(detectorDefinitions);
  }
}
