package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitTleFactory;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.EventDetectionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventDetectorDefinition;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventType;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class OrekitEventDetectionEngineTest {
  private final OrekitEventDetectionEngine engine = new OrekitEventDetectionEngine(
      new OrekitPropagatorFactory(new OrekitTleFactory()),
      new EventDetectorFactory(List.of()));

  @Test
  void returnsNoEventsWhenNoDetectorsAreRequested() {
    assertThat(engine.detect(
        PropagationTestFixtures.runtimeSatellite(),
        Instant.parse("2026-05-08T04:47:05Z"),
        Instant.parse("2026-05-08T04:48:05Z"),
        List.of()))
        .isEmpty();
  }

  @Test
  void rejectsDetectorDefinitionsWithoutRegisteredOrekitBuilder() {
    assertThatThrownBy(() -> engine.detect(
        PropagationTestFixtures.runtimeSatellite(),
        Instant.parse("2026-05-08T04:47:05Z"),
        Instant.parse("2026-05-08T04:48:05Z"),
        List.of(new TestDefinition(PropagationEventType.CUSTOM))))
        .isInstanceOf(EventDetectionException.class)
        .hasMessageContaining("No Orekit event detector registered");
  }

  private record TestDefinition(PropagationEventType eventType)
      implements PropagationEventDetectorDefinition {
  }
}
