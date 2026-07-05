package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitTleFactory;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class OrekitTlePropagationEngineTest {
  private final OrekitTlePropagationEngine engine = new OrekitTlePropagationEngine(
      new OrekitPropagatorFactory(new OrekitTleFactory()));

  @BeforeAll
  static void initOrekit() {
    OrekitTestDataLoader.ensureLoaded();
  }

  @Test
  void propagatesRuntimeSatelliteToTemeStates() {
    List<Instant> samples = List.of(
        Instant.parse("2026-05-08T04:47:05Z"),
        Instant.parse("2026-05-08T04:48:05Z"));

    List<PropagatedState> states = engine.propagate(PropagationTestFixtures.runtimeSatellite(), samples);

    assertThat(states).hasSize(2);
    assertThat(states).allSatisfy(state -> {
      assertThat(state.frameName()).isEqualTo("TEME");
      assertThat(state.position().xMeters()).isFinite();
      assertThat(state.position().yMeters()).isFinite();
      assertThat(state.position().zMeters()).isFinite();
      assertThat(state.velocity().xMeters()).isFinite();
      assertThat(state.velocity().yMeters()).isFinite();
      assertThat(state.velocity().zMeters()).isFinite();
    });
    assertThat(states.get(0).timestamp()).isEqualTo(samples.get(0));
    assertThat(states.get(1).timestamp()).isEqualTo(samples.get(1));
  }
}
