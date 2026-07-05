package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SpatialIndexModelTest {
  @Test
  void candidateResultDefensivelyCopiesCandidates() {
    List<SpatialCandidate> candidates = new ArrayList<>();
    candidates.add(new SpatialCandidate(DefaultSpatialIndexBuilderTest.satellite(10001, "51.0", "140.0", "15.4")));

    SpatialCandidateResult result = new SpatialCandidateResult(candidates, 2, 1);
    candidates.clear();

    assertThat(result.candidates()).hasSize(1);
    assertThat(result.satellites())
        .extracting(CatalogSatellite::noradCatalogId)
        .containsExactly(10001);
    assertThatThrownBy(() -> result.candidates().add(
        new SpatialCandidate(DefaultSpatialIndexBuilderTest.satellite(10002, "51.0", "140.0", "15.4"))))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void candidateResultValidatesStatistics() {
    assertThatThrownBy(() -> new SpatialCandidateResult(List.of(), 1, 0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Spatial candidates seen must equal candidates plus skipped primary satellites");
  }
}
