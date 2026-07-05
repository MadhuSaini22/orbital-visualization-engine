package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationEngine;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class RelativeMotionServiceTest {
  @Test
  void coordinatesSatelliteLookupPropagationAndEngine() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    RecordingRelativeMotionEngine engine = new RecordingRelativeMotionEngine();
    RelativeMotionService service = new RelativeMotionService(
        new FakeRuntimeSatelliteService(satellite),
        new PropagationService(new FakePropagationEngine()),
        engine);
    RelativeMotionRequest request = RelativeMotionModelTest.request();

    RelativeMotionResult result = service.computeRelativeMotion(request);

    assertThat(engine.request).isSameAs(request);
    assertThat(engine.primaryPropagation.satellite()).isSameAs(satellite);
    assertThat(engine.secondaryPropagation.satellite()).isSameAs(satellite);
    assertThat(engine.primaryPropagation.states()).hasSize(11);
    assertThat(engine.secondaryPropagation.states()).hasSize(11);
    assertThat(result.states()).containsExactly(RelativeMotionModelTest.state(RelativeMotionModelTest.START));
  }

  @Test
  void rejectsNullRequest() {
    RelativeMotionService service = new RelativeMotionService(
        new FakeRuntimeSatelliteService(PropagationTestFixtures.runtimeSatellite()),
        new PropagationService(new FakePropagationEngine()),
        new RecordingRelativeMotionEngine());

    assertThatThrownBy(() -> service.computeRelativeMotion(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Relative motion request is required");
  }

  private static final class FakeRuntimeSatelliteService extends RuntimeSatelliteService {
    private final RuntimeSatellite satellite;

    private FakeRuntimeSatelliteService(RuntimeSatellite satellite) {
      super(null, null);
      this.satellite = satellite;
    }

    @Override
    public RuntimeSatellite findByNoradId(int noradCatalogId) {
      return satellite;
    }
  }

  private static final class FakePropagationEngine implements PropagationEngine {
    @Override
    public List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes) {
      return sampleTimes.stream()
          .map(time -> new PropagatedState(
              time,
              "TEME",
              new CartesianVector(1.0, 2.0, 3.0),
              new CartesianVector(4.0, 5.0, 6.0)))
          .toList();
    }
  }

  private static final class RecordingRelativeMotionEngine implements RelativeMotionEngine {
    private RelativeMotionRequest request;
    private PropagationResult primaryPropagation;
    private PropagationResult secondaryPropagation;

    @Override
    public RelativeMotionResult computeRelativeMotion(
        RelativeMotionRequest request,
        PropagationResult primaryPropagation,
        PropagationResult secondaryPropagation) {
      this.request = request;
      this.primaryPropagation = primaryPropagation;
      this.secondaryPropagation = secondaryPropagation;
      return new RelativeMotionResult(
          request,
          List.of(RelativeMotionModelTest.state(request.startTime())));
    }
  }
}
