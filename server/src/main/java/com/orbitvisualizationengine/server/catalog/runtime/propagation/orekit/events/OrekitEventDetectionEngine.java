package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.EventDetectionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.EventDetectionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEvent;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventDetectorDefinition;
import java.time.Instant;
import java.util.List;
import org.orekit.propagation.Propagator;
import org.orekit.propagation.events.EventDetector;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.springframework.stereotype.Component;

@Component
public class OrekitEventDetectionEngine implements EventDetectionEngine {
  private final OrekitPropagatorFactory propagatorFactory;
  private final EventDetectorFactory eventDetectorFactory;

  public OrekitEventDetectionEngine(
      OrekitPropagatorFactory propagatorFactory,
      EventDetectorFactory eventDetectorFactory) {
    this.propagatorFactory = propagatorFactory;
    this.eventDetectorFactory = eventDetectorFactory;
  }

  @Override
  public List<PropagationEvent> detect(
      RuntimeSatellite satellite,
      Instant startTime,
      Instant stopTime,
      List<PropagationEventDetectorDefinition> detectorDefinitions) {
    if (detectorDefinitions.isEmpty()) {
      return List.of();
    }

    try {
      EventCollector collector = new EventCollector();
      Propagator propagator = propagatorFactory.createPropagator(satellite.tle());
      for (EventDetector detector : eventDetectorFactory.createDetectors(detectorDefinitions, collector)) {
        propagator.addEventDetector(detector);
      }
      propagator.propagate(toAbsoluteDate(startTime), toAbsoluteDate(stopTime));
      return collector.events();
    } catch (EventDetectionException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw new EventDetectionException("Unable to detect propagation events", exception);
    }
  }

  private static AbsoluteDate toAbsoluteDate(Instant instant) {
    return new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
  }
}
