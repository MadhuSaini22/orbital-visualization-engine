package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.EventDetectionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventDetectorDefinition;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.events.PropagationEventType;
import java.util.List;
import org.hipparchus.ode.events.Action;
import org.junit.jupiter.api.Test;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.events.EventDetector;
import org.orekit.propagation.events.handlers.EventHandler;

class EventDetectorFactoryTest {
  @Test
  void returnsEmptyDetectorListWhenNoDefinitionsAreRequested() {
    EventDetectorFactory factory = new EventDetectorFactory(List.of());

    assertThat(factory.createDetectors(List.of(), new EventCollector())).isEmpty();
  }

  @Test
  void delegatesSupportedDefinitionToRegisteredBuilder() {
    TestDefinition definition = new TestDefinition(PropagationEventType.CUSTOM);
    EventDetector detector = new TestEventDetector();
    EventDetectorFactory factory = new EventDetectorFactory(List.of(new TestBuilder(definition, detector)));

    List<EventDetector> detectors = factory.createDetectors(List.of(definition), new EventCollector());

    assertThat(detectors).containsExactly(detector);
  }

  @Test
  void rejectsUnsupportedDetectorDefinitions() {
    EventDetectorFactory factory = new EventDetectorFactory(List.of());

    assertThatThrownBy(() -> factory.createDetectors(
        List.of(new TestDefinition(PropagationEventType.CUSTOM)),
        new EventCollector()))
        .isInstanceOf(EventDetectionException.class)
        .hasMessageContaining("No Orekit event detector registered");
  }

  private record TestDefinition(PropagationEventType eventType)
      implements PropagationEventDetectorDefinition {
  }

  private record TestBuilder(
      PropagationEventDetectorDefinition supportedDefinition,
      EventDetector detector) implements OrekitEventDetectorBuilder {
    @Override
    public boolean supports(PropagationEventDetectorDefinition definition) {
      return definition == supportedDefinition;
    }

    @Override
    public EventDetector createDetector(
        PropagationEventDetectorDefinition definition,
        EventCollector collector) {
      return detector;
    }
  }

  private static final class TestEventDetector implements EventDetector {
    @Override
    public double g(SpacecraftState state) {
      return 1.0;
    }

    @Override
    public EventHandler getHandler() {
      return (state, detector, increasing) -> Action.CONTINUE;
    }
  }
}
