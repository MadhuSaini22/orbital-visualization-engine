package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class DefaultCatalogConjunctionEngineTest {
  @Test
  void screensCatalogSkipsPrimaryKeepsConjunctionsAndSortsByMissDistance() {
    CatalogSatellite primary = CatalogConjunctionModelTest.satellite(25544);
    CatalogSatellite clear = CatalogConjunctionModelTest.satellite(10001);
    CatalogSatellite farther = CatalogConjunctionModelTest.satellite(10002);
    CatalogSatellite closer = CatalogConjunctionModelTest.satellite(10003);
    RecordingConjunctionService conjunctionService = new RecordingConjunctionService();
    DefaultCatalogConjunctionEngine engine = new DefaultCatalogConjunctionEngine(
        new FakeCatalogService(List.of(primary, clear, farther, closer)),
        conjunctionService);
    CatalogConjunctionRequest request = CatalogConjunctionModelTest.request(1000.0, null);

    CatalogConjunctionResult result = engine.screen(request, primary);

    assertThat(conjunctionService.requests)
        .extracting(ConjunctionRequest::secondaryNoradCatalogId)
        .containsExactly(10001, 10002, 10003);
    assertThat(result.candidates())
        .extracting(candidate -> candidate.satellite().noradCatalogId())
        .containsExactly(10003, 10002);
    assertThat(result.candidates())
        .extracting(candidate -> candidate.conjunctionResult().closestApproach().missDistanceMeters())
        .containsExactly(25.0, 250.0);
    assertThat(result.statistics()).isEqualTo(new CatalogScreeningStatistics(4, 1, 3, 2, 1));
  }

  private static final class RecordingConjunctionService extends ConjunctionService {
    private final List<ConjunctionRequest> requests = new ArrayList<>();

    private RecordingConjunctionService() {
      super(null, null, null, null);
    }

    @Override
    public ConjunctionResult analyze(ConjunctionRequest request) {
      requests.add(request);
      return switch (request.secondaryNoradCatalogId()) {
        case 10002 -> result(request, 250.0, ConjunctionStatus.CONJUNCTION);
        case 10003 -> result(request, 25.0, ConjunctionStatus.CONJUNCTION);
        default -> result(request, 5000.0, ConjunctionStatus.CLEAR);
      };
    }

    private static ConjunctionResult result(
        ConjunctionRequest request,
        double missDistanceMeters,
        ConjunctionStatus status) {
      return new ConjunctionResult(
          request,
          new ClosestApproach(
              ConjunctionModelTest.START,
              missDistanceMeters,
              12.0,
              ConjunctionModelTest.relativeState(
                  ConjunctionModelTest.START,
                  missDistanceMeters,
                  0.0,
                  0.0,
                  12.0,
                  0.0,
                  0.0)),
          status);
    }
  }

  private static final class FakeCatalogService extends CatalogService {
    private final List<CatalogSatellite> satellites;

    private FakeCatalogService(List<CatalogSatellite> satellites) {
      super(null, null);
      this.satellites = satellites;
    }

    @Override
    public Stream<CatalogSatellite> stream() {
      return satellites.stream();
    }
  }
}
