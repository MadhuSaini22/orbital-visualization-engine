package com.orbitvisualizationengine.server.catalog.runtime.propagation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PropagationServiceTest {
  private static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  private static final Instant STOP = Instant.parse("2026-05-08T04:50:05Z");

  @Test
  void delegatesValidatedSampleTimesToEngine() {
    RecordingEngine engine = new RecordingEngine();
    PropagationService service = new PropagationService(engine);
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();

    PropagationResult result = service.propagate(satellite, START, STOP, Duration.ofSeconds(60));

    assertThat(engine.satellite).isSameAs(satellite);
    assertThat(engine.sampleTimes).containsExactly(
        START,
        Instant.parse("2026-05-08T04:48:05Z"),
        Instant.parse("2026-05-08T04:49:05Z"),
        STOP);
    assertThat(result.satellite()).isSameAs(satellite);
    assertThat(result.states()).hasSize(4);
  }

  @Test
  void includesStopTimeWhenStepDoesNotLandExactly() {
    RecordingEngine engine = new RecordingEngine();
    PropagationService service = new PropagationService(engine);

    service.propagate(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        STOP,
        Duration.ofSeconds(80));

    assertThat(engine.sampleTimes).containsExactly(
        START,
        Instant.parse("2026-05-08T04:48:25Z"),
        Instant.parse("2026-05-08T04:49:45Z"),
        STOP);
  }

  @Test
  void equalStartAndStopProducesSingleState() {
    RecordingEngine engine = new RecordingEngine();
    PropagationService service = new PropagationService(engine);

    PropagationResult result = service.propagate(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        START,
        Duration.ofSeconds(60));

    assertThat(engine.sampleTimes).containsExactly(START);
    assertThat(result.states()).hasSize(1);
  }

  @Test
  void rejectsInvalidRequestParameters() {
    PropagationService service = new PropagationService(new RecordingEngine());

    assertThatThrownBy(() -> service.propagate(null, START, STOP, Duration.ofSeconds(60)))
        .isInstanceOf(PropagationRequestException.class)
        .hasMessageContaining("Runtime satellite is required");

    assertThatThrownBy(() -> service.propagate(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        START.minusSeconds(1),
        Duration.ofSeconds(60)))
        .isInstanceOf(PropagationRequestException.class)
        .hasMessageContaining("Stop time");

    assertThatThrownBy(() -> service.propagate(
        PropagationTestFixtures.runtimeSatellite(),
        START,
        STOP,
        Duration.ZERO))
        .isInstanceOf(PropagationRequestException.class)
        .hasMessageContaining("positive");
  }

  @Test
  void propagationResultDefensivelyCopiesStates() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    List<PropagatedState> mutableStates = new ArrayList<>();
    mutableStates.add(state(START));

    PropagationResult result = new PropagationResult(
        satellite,
        START,
        STOP,
        Duration.ofSeconds(60),
        mutableStates);

    mutableStates.add(state(STOP));

    assertThat(result.states()).hasSize(1);
    assertThatThrownBy(() -> result.states().add(state(STOP)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void propagationResultRejectsInvalidTimeBounds() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();

    assertThatThrownBy(() -> new PropagationResult(
        satellite,
        STOP,
        START,
        Duration.ofSeconds(60),
        List.of(state(START))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Stop time");

    assertThatThrownBy(() -> new PropagationResult(
        satellite,
        START,
        STOP,
        Duration.ZERO,
        List.of(state(START))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("positive");
  }

  private static final class RecordingEngine implements PropagationEngine {
    private RuntimeSatellite satellite;
    private List<Instant> sampleTimes;

    @Override
    public List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes) {
      this.satellite = satellite;
      this.sampleTimes = sampleTimes;
      return sampleTimes.stream()
          .map(time -> new PropagatedState(
              time,
              "TEST",
              new CartesianVector(1.0, 2.0, 3.0),
              new CartesianVector(4.0, 5.0, 6.0)))
          .toList();
    }
  }

  private static PropagatedState state(Instant timestamp) {
    return new PropagatedState(
        timestamp,
        "TEST",
        new CartesianVector(1.0, 2.0, 3.0),
        new CartesianVector(4.0, 5.0, 6.0));
  }
}
