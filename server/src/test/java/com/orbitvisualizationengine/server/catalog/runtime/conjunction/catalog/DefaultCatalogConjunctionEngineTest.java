package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial.SpatialCandidate;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial.SpatialCandidateResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial.SpatialIndexEngine;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
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
        new FakeSpatialIndexEngine(primary, List.of(clear, farther, closer)),
        conjunctionService,
        new DefaultScreeningExecutor());
    CatalogConjunctionRequest request = CatalogConjunctionModelTest.request(1000.0, null);

    CatalogConjunctionResult result = engine.screen(request, primary);

    assertThat(conjunctionService.requests)
        .extracting(ConjunctionRequest::secondaryNoradCatalogId)
        .containsExactlyInAnyOrder(10001, 10002, 10003);
    assertThat(result.candidates())
        .extracting(candidate -> candidate.satellite().noradCatalogId())
        .containsExactly(10003, 10002);
    assertThat(result.candidates())
        .extracting(candidate -> candidate.conjunctionResult().closestApproach().missDistanceMeters())
        .containsExactly(25.0, 250.0);
    assertThat(result.statistics()).isEqualTo(new CatalogScreeningStatistics(4, 1, 3, 2, 1));
    assertThat(result.executionStatistics()).isEqualTo(new ScreeningExecutionStatistics(3, 3, 0));
  }

  private static final class RecordingConjunctionService extends ConjunctionService {
    private final List<ConjunctionRequest> requests = new CopyOnWriteArrayList<>();

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

  private static final class FakeSpatialIndexEngine implements SpatialIndexEngine {
    private final CatalogSatellite primary;
    private final List<CatalogSatellite> candidates;

    private FakeSpatialIndexEngine(CatalogSatellite primary, List<CatalogSatellite> candidates) {
      this.primary = primary;
      this.candidates = candidates;
    }

    @Override
    public SpatialCandidateResult findCandidates(CatalogSatellite primarySatellite) {
      assertThat(primarySatellite).isEqualTo(primary);
      return new SpatialCandidateResult(
          candidates.stream().map(SpatialCandidate::new).toList(),
          candidates.size() + 1L,
          1L);
    }
  }
}
