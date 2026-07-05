package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CatalogConjunctionModelTest {
  @Test
  void validatesRequest() {
    assertThatThrownBy(() -> new CatalogConjunctionRequest(
        0,
        ConjunctionModelTest.START,
        ConjunctionModelTest.STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN,
        1000.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary NORAD catalog id must be positive");

    assertThatThrownBy(() -> new CatalogConjunctionRequest(
        25544,
        ConjunctionModelTest.START,
        ConjunctionModelTest.STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN,
        -1.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Miss-distance threshold must be non-negative");
  }

  @Test
  void defaultsRelativeFrame() {
    CatalogConjunctionRequest request = request(1000.0, null);

    assertThat(request.relativeFrame()).isEqualTo(RelativeFrame.LVLH_RTN);
  }

  @Test
  void statisticsValidateInternalConsistency() {
    CatalogScreeningStatistics statistics = new CatalogScreeningStatistics(4, 1, 3, 2, 1);

    assertThat(statistics.conjunctionCandidates()).isEqualTo(2);
    assertThatThrownBy(() -> new CatalogScreeningStatistics(4, 1, 2, 1, 1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Catalog satellites seen must equal skipped plus analyzed candidates");
  }

  @Test
  void executionStatisticsValidateInternalConsistency() {
    ScreeningExecutionStatistics statistics = new ScreeningExecutionStatistics(3, 2, 1);

    assertThat(statistics.failedTasks()).isEqualTo(1);
    assertThatThrownBy(() -> new ScreeningExecutionStatistics(3, 3, 1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Submitted tasks must equal successful plus failed tasks");
  }

  @Test
  void resultDefensivelyCopiesCandidates() {
    CatalogConjunctionRequest request = request(1000.0, RelativeFrame.LVLH_RTN);
    List<CatalogConjunctionCandidate> candidates = new ArrayList<>();
    candidates.add(candidate(satellite(20580), 10.0, ConjunctionStatus.CONJUNCTION));

    CatalogConjunctionResult result = new CatalogConjunctionResult(
        request,
        satellite(25544),
        candidates,
        new CatalogScreeningStatistics(2, 1, 1, 1, 0),
        new ScreeningExecutionStatistics(1, 1, 0));
    candidates.clear();

    assertThat(result.candidates()).hasSize(1);
    assertThatThrownBy(() -> result.candidates().add(candidate(satellite(28884), 20.0, ConjunctionStatus.CONJUNCTION)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  static CatalogConjunctionRequest request(double thresholdMeters, RelativeFrame frame) {
    return new CatalogConjunctionRequest(
        25544,
        ConjunctionModelTest.START,
        ConjunctionModelTest.STOP,
        Duration.ofSeconds(60),
        frame,
        thresholdMeters);
  }

  static CatalogSatellite satellite(int noradCatalogId) {
    return new CatalogSatellite(
        noradCatalogId,
        101,
        501,
        "test-source",
        "Test Source",
        "SAT-" + noradCatalogId,
        "1998-067A",
        "payload",
        "U",
        "US",
        1998,
        67,
        "A",
        ConjunctionModelTest.START,
        "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        999,
        0,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        56555,
        1,
        101,
        ConjunctionModelTest.START,
        ConjunctionModelTest.START);
  }

  static CatalogConjunctionCandidate candidate(
      CatalogSatellite satellite,
      double missDistanceMeters,
      ConjunctionStatus status) {
    ConjunctionResult result = new ConjunctionResult(
        ConjunctionModelTest.request(1000.0),
        new com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach(
            ConjunctionModelTest.START,
            missDistanceMeters,
            1.0,
            ConjunctionModelTest.relativeState(
                ConjunctionModelTest.START,
                missDistanceMeters,
                0.0,
                0.0,
                1.0,
                0.0,
                0.0)),
        status);
    return new CatalogConjunctionCandidate(satellite, result);
  }
}
