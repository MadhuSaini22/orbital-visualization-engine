package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

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
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class ConjunctionServiceTest {
  @Test
  void coordinatesSatelliteLookupPropagationRelativeMotionAndConjunctionEngine() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    RecordingRelativeMotionService relativeMotionService = new RecordingRelativeMotionService();
    RecordingConjunctionEngine conjunctionEngine = new RecordingConjunctionEngine();
    ConjunctionService service = new ConjunctionService(
        new FakeRuntimeSatelliteService(satellite),
        new PropagationService(new FakePropagationEngine()),
        relativeMotionService,
        conjunctionEngine);
    ConjunctionRequest request = ConjunctionModelTest.request(1000.0);

    ConjunctionResult result = service.analyze(request);

    assertThat(relativeMotionService.request.primaryNoradCatalogId()).isEqualTo(request.primaryNoradCatalogId());
    assertThat(relativeMotionService.request.secondaryNoradCatalogId()).isEqualTo(request.secondaryNoradCatalogId());
    assertThat(relativeMotionService.primaryPropagation.satellite()).isSameAs(satellite);
    assertThat(relativeMotionService.secondaryPropagation.satellite()).isSameAs(satellite);
    assertThat(relativeMotionService.primaryPropagation.states()).hasSize(11);
    assertThat(conjunctionEngine.request).isSameAs(request);
    assertThat(conjunctionEngine.relativeMotionResult).isSameAs(relativeMotionService.result);
    assertThat(result.status()).isEqualTo(ConjunctionStatus.CONJUNCTION);
  }

  @Test
  void rejectsNullRequest() {
    ConjunctionService service = new ConjunctionService(
        new FakeRuntimeSatelliteService(PropagationTestFixtures.runtimeSatellite()),
        new PropagationService(new FakePropagationEngine()),
        new RecordingRelativeMotionService(),
        new RecordingConjunctionEngine());

    assertThatThrownBy(() -> service.analyze(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Conjunction request is required");
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

  private static final class RecordingRelativeMotionService extends RelativeMotionService {
    private RelativeMotionRequest request;
    private PropagationResult primaryPropagation;
    private PropagationResult secondaryPropagation;
    private RelativeMotionResult result;

    private RecordingRelativeMotionService() {
      super(null, null, new NoopRelativeMotionEngine());
    }

    @Override
    public RelativeMotionResult computeRelativeMotion(
        RelativeMotionRequest request,
        PropagationResult primaryPropagation,
        PropagationResult secondaryPropagation) {
      this.request = request;
      this.primaryPropagation = primaryPropagation;
      this.secondaryPropagation = secondaryPropagation;
      this.result = new RelativeMotionResult(
          request,
          List.of(ConjunctionModelTest.relativeState(
              request.startTime(),
              1.0,
              2.0,
              3.0,
              4.0,
              5.0,
              6.0)));
      return result;
    }
  }

  private static final class RecordingConjunctionEngine implements ConjunctionEngine {
    private ConjunctionRequest request;
    private RelativeMotionResult relativeMotionResult;

    @Override
    public ConjunctionResult analyze(
        ConjunctionRequest request,
        RelativeMotionResult relativeMotionResult) {
      this.request = request;
      this.relativeMotionResult = relativeMotionResult;
      return new ConjunctionResult(
          request,
          new ClosestApproach(
              request.startTime(),
              1.0,
              2.0,
              relativeMotionResult.states().getFirst()),
          ConjunctionStatus.CONJUNCTION);
    }
  }

  private static final class NoopRelativeMotionEngine implements RelativeMotionEngine {
    @Override
    public RelativeMotionResult computeRelativeMotion(
        RelativeMotionRequest request,
        PropagationResult primaryPropagation,
        PropagationResult secondaryPropagation) {
      throw new UnsupportedOperationException("not used");
    }
  }
}
