package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventDetectorDefinition;
import org.orekit.propagation.events.EventDetector;

public interface OrekitEventDetectorBuilder {
  boolean supports(PropagationEventDetectorDefinition definition);

  EventDetector createDetector(
      PropagationEventDetectorDefinition definition,
      EventCollector collector);
}
