package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CatalogConjunctionServiceTest {
  @Test
  void loadsPrimaryRuntimeSatelliteAndDelegatesToEngine() {
    CatalogSatellite primary = CatalogConjunctionModelTest.satellite(25544);
    RecordingRuntimeSatelliteService runtimeSatelliteService = new RecordingRuntimeSatelliteService();
    RecordingCatalogConjunctionEngine engine = new RecordingCatalogConjunctionEngine();
    CatalogConjunctionService service = new CatalogConjunctionService(
        new FakeCatalogService(List.of(primary)),
        runtimeSatelliteService,
        engine);
    CatalogConjunctionRequest request = CatalogConjunctionModelTest.request(1000.0, null);

    CatalogConjunctionResult result = service.screen(request);

    assertThat(runtimeSatelliteService.requestedNoradCatalogId).isEqualTo(25544);
    assertThat(engine.request).isSameAs(request);
    assertThat(engine.primarySatellite).isSameAs(primary);
    assertThat(result.primarySatellite()).isSameAs(primary);
  }

  @Test
  void rejectsNullRequest() {
    CatalogConjunctionService service = new CatalogConjunctionService(
        new FakeCatalogService(List.of()),
        new RecordingRuntimeSatelliteService(),
        new RecordingCatalogConjunctionEngine());

    assertThatThrownBy(() -> service.screen(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Catalog conjunction request is required");
  }

  private static final class RecordingRuntimeSatelliteService extends RuntimeSatelliteService {
    private int requestedNoradCatalogId;

    private RecordingRuntimeSatelliteService() {
      super(null, null);
    }

    @Override
    public RuntimeSatellite findByNoradId(int noradCatalogId) {
      this.requestedNoradCatalogId = noradCatalogId;
      return PropagationTestFixtures.runtimeSatellite();
    }
  }

  private static final class RecordingCatalogConjunctionEngine implements CatalogConjunctionEngine {
    private CatalogConjunctionRequest request;
    private CatalogSatellite primarySatellite;

    @Override
    public CatalogConjunctionResult screen(
        CatalogConjunctionRequest request,
        CatalogSatellite primarySatellite) {
      this.request = request;
      this.primarySatellite = primarySatellite;
      return new CatalogConjunctionResult(
          request,
          primarySatellite,
          List.of(),
          new CatalogScreeningStatistics(1, 1, 0, 0, 0));
    }
  }

  private static final class FakeCatalogService extends CatalogService {
    private final List<CatalogSatellite> satellites;

    private FakeCatalogService(List<CatalogSatellite> satellites) {
      super(null, null);
      this.satellites = satellites;
    }

    @Override
    public CatalogSatellite findByNoradId(int noradCatalogId) {
      return satellites.stream()
          .filter(satellite -> satellite.noradCatalogId() == noradCatalogId)
          .findFirst()
          .orElseThrow();
    }

    @Override
    public Stream<CatalogSatellite> stream() {
      return satellites.stream();
    }
  }
}
