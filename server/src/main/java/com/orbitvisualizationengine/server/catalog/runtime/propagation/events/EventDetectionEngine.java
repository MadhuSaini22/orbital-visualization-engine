package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.time.Instant;
import java.util.List;

public interface EventDetectionEngine {
  List<PropagationEvent> detect(
      RuntimeSatellite satellite,
      Instant startTime,
      Instant stopTime,
      List<PropagationEventDetectorDefinition> detectorDefinitions);
}
