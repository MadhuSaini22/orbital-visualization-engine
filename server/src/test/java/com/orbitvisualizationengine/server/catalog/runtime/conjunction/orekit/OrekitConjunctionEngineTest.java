package com.orbitvisualizationengine.server.catalog.runtime.conjunction.orekit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import java.util.List;
import org.junit.jupiter.api.Test;

class OrekitConjunctionEngineTest {
  private final OrekitConjunctionEngine engine = new OrekitConjunctionEngine();

  @Test
  void computesClosestApproachAndConjunctionStatus() {
    ConjunctionRequest request = ConjunctionModelTest.request(100.0);
    RelativeMotionResult relativeMotionResult = new RelativeMotionResult(
        relativeMotionRequest(request),
        List.of(
            ConjunctionModelTest.relativeState(
                request.startTime(),
                300.0,
                0.0,
                0.0,
                10.0,
                0.0,
                0.0),
            ConjunctionModelTest.relativeState(
                request.startTime().plusSeconds(60),
                3.0,
                4.0,
                0.0,
                0.0,
                12.0,
                5.0),
            ConjunctionModelTest.relativeState(
                request.startTime().plusSeconds(120),
                50.0,
                0.0,
                0.0,
                1.0,
                2.0,
                2.0)));

    ConjunctionResult result = engine.analyze(request, relativeMotionResult);

    assertThat(result.status()).isEqualTo(ConjunctionStatus.CONJUNCTION);
    assertThat(result.closestApproach().timeOfClosestApproach())
        .isEqualTo(request.startTime().plusSeconds(60));
    assertThat(result.closestApproach().missDistanceMeters()).isCloseTo(5.0, within(1.0e-12));
    assertThat(result.closestApproach().relativeSpeedMetersPerSecond()).isCloseTo(13.0, within(1.0e-12));
    assertThat(result.closestApproach().relativeState()).isSameAs(relativeMotionResult.states().get(1));
  }

  @Test
  void reportsClearWhenMissDistanceExceedsThreshold() {
    ConjunctionRequest request = ConjunctionModelTest.request(4.0);
    RelativeMotionResult relativeMotionResult = new RelativeMotionResult(
        relativeMotionRequest(request),
        List.of(ConjunctionModelTest.relativeState(
            request.startTime(),
            3.0,
            4.0,
            0.0,
            0.0,
            0.0,
            1.0)));

    ConjunctionResult result = engine.analyze(request, relativeMotionResult);

    assertThat(result.status()).isEqualTo(ConjunctionStatus.CLEAR);
    assertThat(result.closestApproach().missDistanceMeters()).isCloseTo(5.0, within(1.0e-12));
  }

  @Test
  void rejectsMissingRelativeMotionResult() {
    assertThatThrownBy(() -> engine.analyze(ConjunctionModelTest.request(100.0), null))
        .isInstanceOf(ConjunctionException.class)
        .hasMessage("Relative motion result is required");
  }

  private static com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest
      relativeMotionRequest(ConjunctionRequest request) {
    return new com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest(
        request.primaryNoradCatalogId(),
        request.secondaryNoradCatalogId(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.relativeFrame());
  }
}
