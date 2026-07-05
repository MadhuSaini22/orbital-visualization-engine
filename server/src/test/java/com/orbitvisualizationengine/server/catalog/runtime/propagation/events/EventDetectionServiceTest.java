package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationEngine;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EventDetectionServiceTest {
  private static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  private static final Instant STOP = Instant.parse("2026-05-08T04:48:05Z");

  @Test
  void coordinatesPropagationAndIndependentEventDetection() {
    RecordingPropagationEngine propagationEngine = new RecordingPropagationEngine();
    RecordingEventDetectionEngine eventEngine = new RecordingEventDetectionEngine(List.of(
        event(PropagationEventType.CUSTOM, START)));
    EventDetectionService service = new EventDetectionService(
        new PropagationService(propagationEngine),
        eventEngine);
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    List<PropagationEventDetectorDefinition> definitions = List.of(
        new TestDetectorDefinition(PropagationEventType.CUSTOM, "custom-detector"));

    EventDetectionResult result = service.detectEvents(
        satellite,
        START,
        STOP,
        Duration.ofSeconds(60),
        definitions);

    assertThat(propagationEngine.satellite).isSameAs(satellite);
    assertThat(eventEngine.satellite).isSameAs(satellite);
    assertThat(eventEngine.definitions).containsExactlyElementsOf(definitions);
    assertThat(result.propagationResult().states()).hasSize(2);
    assertThat(result.events()).containsExactly(event(PropagationEventType.CUSTOM, START));
  }

  @Test
  void nullDetectorDefinitionsMeanNoDetectors() {
    RecordingEventDetectionEngine eventEngine = new RecordingEventDetectionEngine(List.of());
    EventDetectionService service = new EventDetectionService(
        new PropagationService(new RecordingPropagationEngine()),
        eventEngine);

    EventDetectionResult result = service.detectEvents(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        STOP,
        Duration.ofSeconds(60),
        null);

    assertThat(eventEngine.definitions).isEmpty();
    assertThat(result.events()).isEmpty();
  }

  @Test
  void rejectsNullDetectorDefinitionEntriesBeforeEventEngineRuns() {
    RecordingEventDetectionEngine eventEngine = new RecordingEventDetectionEngine(List.of());
    EventDetectionService service = new EventDetectionService(
        new PropagationService(new RecordingPropagationEngine()),
        eventEngine);
    List<PropagationEventDetectorDefinition> definitions = new ArrayList<>();
    definitions.add(new TestDetectorDefinition(PropagationEventType.CUSTOM, "custom"));
    definitions.add(null);

    assertThatThrownBy(() -> service.detectEvents(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        STOP,
        Duration.ofSeconds(60),
        definitions))
        .isInstanceOf(EventDetectionRequestException.class)
        .hasMessageContaining("must not contain null");

    assertThat(eventEngine.called).isFalse();
  }

  @Test
  void eventDetectionResultDefensivelyCopiesEvents() {
    PropagationResult propagationResult = new PropagationService(new RecordingPropagationEngine())
        .propagate(PropagationTestFixtures.runtimeSatellite(), START, STOP, Duration.ofSeconds(60));
    List<PropagationEvent> events = new ArrayList<>();
    events.add(event(PropagationEventType.CUSTOM, START));

    EventDetectionResult result = new EventDetectionResult(propagationResult, events);

    events.add(event(PropagationEventType.CUSTOM, STOP));

    assertThat(result.events()).hasSize(1);
    assertThatThrownBy(() -> result.events().add(event(PropagationEventType.CUSTOM, STOP)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  private static PropagationEvent event(PropagationEventType type, Instant timestamp) {
    return new PropagationEvent(type, timestamp, true, type.name(), Map.of());
  }

  private record TestDetectorDefinition(
      PropagationEventType eventType,
      String detectorName) implements PropagationEventDetectorDefinition {
  }

  private static final class RecordingPropagationEngine implements PropagationEngine {
    private RuntimeSatellite satellite;

    @Override
    public List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes) {
      this.satellite = satellite;
      return sampleTimes.stream()
          .map(time -> new PropagatedState(
              time,
              "TEST",
              new CartesianVector(1.0, 2.0, 3.0),
              new CartesianVector(4.0, 5.0, 6.0)))
          .toList();
    }
  }

  private static final class RecordingEventDetectionEngine implements EventDetectionEngine {
    private final List<PropagationEvent> events;
    private RuntimeSatellite satellite;
    private List<PropagationEventDetectorDefinition> definitions;
    private boolean called;

    private RecordingEventDetectionEngine(List<PropagationEvent> events) {
      this.events = events;
    }

    @Override
    public List<PropagationEvent> detect(
        RuntimeSatellite satellite,
        Instant startTime,
        Instant stopTime,
        List<PropagationEventDetectorDefinition> detectorDefinitions) {
      this.called = true;
      this.satellite = satellite;
      this.definitions = detectorDefinitions;
      return events;
    }
  }
}
