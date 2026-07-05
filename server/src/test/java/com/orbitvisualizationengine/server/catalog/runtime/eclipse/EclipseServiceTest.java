package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

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

class EclipseServiceTest {
  @Test
  void coordinatesRuntimeSatellitePropagationAndEclipseEngine() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    RecordingEclipseEngine eclipseEngine = new RecordingEclipseEngine();
    EclipseService service = new EclipseService(
        new FakeRuntimeSatelliteService(satellite),
        new PropagationService(new FakePropagationEngine()),
        eclipseEngine);
    EclipseRequest request = EclipseModelTest.request();

    EclipseResult result = service.computeEclipses(request);

    assertThat(eclipseEngine.request).isSameAs(request);
    assertThat(eclipseEngine.propagationResult.satellite()).isSameAs(satellite);
    assertThat(eclipseEngine.propagationResult.states()).hasSize(61);
    assertThat(result.intervals()).containsExactly(EclipseModelTest.interval(
        EclipseType.SUNLIGHT,
        EclipseModelTest.START,
        EclipseModelTest.STOP));
  }

  @Test
  void rejectsNullRequest() {
    EclipseService service = new EclipseService(
        new FakeRuntimeSatelliteService(PropagationTestFixtures.runtimeSatellite()),
        new PropagationService(new FakePropagationEngine()),
        new RecordingEclipseEngine());

    assertThatThrownBy(() -> service.computeEclipses(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Eclipse request is required");
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

  private static final class RecordingEclipseEngine implements EclipseEngine {
    private EclipseRequest request;
    private PropagationResult propagationResult;

    @Override
    public EclipseResult computeEclipses(EclipseRequest request, PropagationResult propagationResult) {
      this.request = request;
      this.propagationResult = propagationResult;
      return new EclipseResult(request, List.of(EclipseModelTest.interval(
          EclipseType.SUNLIGHT,
          request.startTime(),
          request.stopTime())));
    }
  }
}
