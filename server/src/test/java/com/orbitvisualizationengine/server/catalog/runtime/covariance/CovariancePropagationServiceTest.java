package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.util.List;
import org.junit.jupiter.api.Test;

class CovariancePropagationServiceTest {
  @Test
  void validatesLoadsRuntimeSatelliteAndDelegatesToEngine() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    RecordingRuntimeSatelliteService runtimeSatelliteService = new RecordingRuntimeSatelliteService(satellite);
    RecordingCovariancePropagationEngine engine = new RecordingCovariancePropagationEngine();
    CovariancePropagationService service = new CovariancePropagationService(runtimeSatelliteService, engine);
    CovariancePropagationRequest request = CovarianceModelTest.request();

    CovariancePropagationResult result = service.propagate(request);

    assertThat(runtimeSatelliteService.requestedNoradCatalogId).isEqualTo(25544);
    assertThat(engine.request).isSameAs(request);
    assertThat(engine.satellite).isSameAs(satellite);
    assertThat(result.satellite()).isSameAs(satellite);
  }

  @Test
  void rejectsNullRequest() {
    CovariancePropagationService service = new CovariancePropagationService(
        new RecordingRuntimeSatelliteService(PropagationTestFixtures.runtimeSatellite()),
        new RecordingCovariancePropagationEngine());

    assertThatThrownBy(() -> service.propagate(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Covariance propagation request is required");
  }

  private static final class RecordingRuntimeSatelliteService extends RuntimeSatelliteService {
    private final RuntimeSatellite satellite;
    private int requestedNoradCatalogId;

    private RecordingRuntimeSatelliteService(RuntimeSatellite satellite) {
      super(null, null);
      this.satellite = satellite;
    }

    @Override
    public RuntimeSatellite findByNoradId(int noradCatalogId) {
      requestedNoradCatalogId = noradCatalogId;
      return satellite;
    }
  }

  private static final class RecordingCovariancePropagationEngine implements CovariancePropagationEngine {
    private CovariancePropagationRequest request;
    private RuntimeSatellite satellite;

    @Override
    public CovariancePropagationResult propagate(
        CovariancePropagationRequest request,
        RuntimeSatellite satellite) {
      this.request = request;
      this.satellite = satellite;
      return new CovariancePropagationResult(
          request,
          satellite,
          List.of(new CovarianceState(request.startTime(), request.initialCovariance())));
    }
  }
}
