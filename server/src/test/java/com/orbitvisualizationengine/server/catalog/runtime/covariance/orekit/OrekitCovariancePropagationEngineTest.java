package com.orbitvisualizationengine.server.catalog.runtime.covariance.orekit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceMatrix;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationRequest;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class OrekitCovariancePropagationEngineTest {
  @Test
  void samplesCovarianceAtRequestedEpochsAndPropagatesCartesianCovariance() {
    CovariancePropagationRequest request = new CovariancePropagationRequest(
        25544,
        java.time.Instant.parse("2026-05-08T04:47:05Z"),
        java.time.Instant.parse("2026-05-08T04:49:05Z"),
        Duration.ofSeconds(60),
        diagonal(10.0, 10.0, 10.0, 0.01, 0.01, 0.01));
    OrekitCovariancePropagationEngine engine = new OrekitCovariancePropagationEngine(
        new OrekitPropagatorFactory(null));

    CovariancePropagationResult result = engine.propagate(request, PropagationTestFixtures.runtimeSatellite());

    assertThat(result.states()).hasSize(3);
    assertThat(result.states())
        .extracting(state -> state.timestamp())
        .containsExactly(request.startTime(), request.startTime().plusSeconds(60), request.stopTime());
    assertThat(result.states().getFirst().covarianceMatrix().valueAt(0, 0))
        .isCloseTo(10.0, within(1.0e-12));
    assertThat(result.states().get(1).covarianceMatrix().valueAt(0, 0))
        .isCloseTo(46.0, within(1.0e-12));
    assertThat(result.states().get(1).covarianceMatrix().valueAt(0, 3))
        .isCloseTo(0.6, within(1.0e-12));
    assertThat(result.states().get(2).covarianceMatrix().valueAt(0, 0))
        .isCloseTo(154.0, within(1.0e-12));
  }

  private static CovarianceMatrix diagonal(double... diagonal) {
    List<List<Double>> values = new ArrayList<>();
    for (int row = 0; row < diagonal.length; row++) {
      List<Double> matrixRow = new ArrayList<>();
      for (int column = 0; column < diagonal.length; column++) {
        matrixRow.add(row == column ? diagonal[row] : 0.0);
      }
      values.add(matrixRow);
    }
    return new CovarianceMatrix(values);
  }
}
