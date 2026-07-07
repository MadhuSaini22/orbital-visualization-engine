package com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class DefaultClosestApproachRefinerTest {
  @Test
  void refinesTcaAroundSampledMinimumUsingRelativeVelocity() {
    RelativeState before = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START.minusSeconds(60),
        100.0,
        0.0,
        0.0,
        -1.0,
        0.0,
        0.0);
    RelativeState sampledMinimum = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START,
        10.0,
        5.0,
        0.0,
        -2.0,
        0.0,
        0.0);
    RelativeState after = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START.plusSeconds(60),
        150.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0);
    ClosestApproachRefinement refinement = new DefaultClosestApproachRefiner(Duration.ofSeconds(30))
        .refine(result(before, sampledMinimum, after));

    assertThat(refinement.statistics().refined()).isTrue();
    assertThat(refinement.statistics().sampledMinimumIndex()).isEqualTo(1);
    assertThat(refinement.statistics().refinementOffsetSeconds()).isCloseTo(5.0, within(1.0e-12));
    assertThat(refinement.closestApproach().timeOfClosestApproach())
        .isEqualTo(ConjunctionModelTest.START.plusSeconds(5));
    assertThat(refinement.closestApproach().missDistanceMeters()).isCloseTo(5.0, within(1.0e-12));
    assertThat(refinement.closestApproach().relativeSpeedMetersPerSecond()).isCloseTo(2.0, within(1.0e-12));
  }

  @Test
  void clampsRefinementToConfiguredWindow() {
    RelativeState sampledMinimum = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START,
        100.0,
        0.0,
        0.0,
        -1.0,
        0.0,
        0.0);
    RelativeState after = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START.plusSeconds(60),
        150.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0);
    ClosestApproachRefinement refinement = new DefaultClosestApproachRefiner(Duration.ofSeconds(10))
        .refine(result(sampledMinimum, after));

    assertThat(refinement.statistics().refined()).isTrue();
    assertThat(refinement.statistics().refinementOffsetSeconds()).isCloseTo(10.0, within(1.0e-12));
    assertThat(refinement.closestApproach().timeOfClosestApproach())
        .isEqualTo(ConjunctionModelTest.START.plusSeconds(10));
    assertThat(refinement.closestApproach().missDistanceMeters()).isCloseTo(90.0, within(1.0e-12));
  }

  @Test
  void doesNotRefineWhenOnlyOneSampleExists() {
    RelativeState sampledMinimum = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START,
        10.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0);
    ClosestApproachRefinement refinement = new DefaultClosestApproachRefiner()
        .refine(result(sampledMinimum));

    assertThat(refinement.statistics()).isEqualTo(
        ClosestApproachRefinementStatistics.notRefined(1, 0));
    assertThat(refinement.closestApproach().timeOfClosestApproach())
        .isEqualTo(ConjunctionModelTest.START);
  }

  @Test
  void rejectsMissingRelativeMotionResult() {
    assertThatThrownBy(() -> new DefaultClosestApproachRefiner().refine(null))
        .isInstanceOf(ConjunctionException.class)
        .hasMessage("Relative motion result is required");
  }

  private static RelativeMotionResult result(RelativeState... states) {
    return new RelativeMotionResult(
        new RelativeMotionRequest(
            25544,
            20580,
            ConjunctionModelTest.START,
            ConjunctionModelTest.STOP,
            Duration.ofSeconds(60),
            states[0].frame()),
        List.of(states));
  }
}
