package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class DefaultCollisionProbabilityEngineTest {
  private final DefaultCollisionProbabilityEngine engine = new DefaultCollisionProbabilityEngine();

  @Test
  void computesIsotropicGaussianEncounterPlaneProbability() {
    CollisionProbabilityRequest request = CollisionProbabilityModelTest.request(20.0, 2.0);

    CollisionProbabilityResult result = engine.compute(request);

    double expected = Math.exp(-2.0) * (1.0 - Math.exp(-0.02));
    assertThat(result.probabilityOfCollision()).isCloseTo(expected, within(1.0e-15));
    assertThat(result.statistics().method())
        .isEqualTo(CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE);
    assertThat(result.statistics().combinedEncounterPlaneVarianceMetersSquared())
        .isCloseTo(100.0, within(1.0e-12));
    assertThat(result.statistics().equivalentSigmaMeters()).isCloseTo(10.0, within(1.0e-12));
    assertThat(result.statistics().normalizedMissDistance()).isCloseTo(2.0, within(1.0e-12));
    assertThat(result.statistics().normalizedHardBodyRadius()).isCloseTo(0.2, within(1.0e-12));
  }

  @Test
  void probabilityIncreasesWithHardBodyRadius() {
    double smaller = engine.compute(CollisionProbabilityModelTest.request(20.0, 1.0)).probabilityOfCollision();
    double larger = engine.compute(CollisionProbabilityModelTest.request(20.0, 5.0)).probabilityOfCollision();

    assertThat(larger).isGreaterThan(smaller);
  }

  @Test
  void rejectsNonSymmetricCovariance() {
    CollisionProbabilityRequest request = new CollisionProbabilityRequest(
        CollisionProbabilityModelTest.conjunctionResult(20.0),
        java.util.List.of(
            java.util.List.of(1.0, 2.0, 0.0),
            java.util.List.of(0.0, 1.0, 0.0),
            java.util.List.of(0.0, 0.0, 1.0)),
        CollisionProbabilityModelTest.diagonal(1.0),
        1.0,
        null);

    assertThatThrownBy(() -> engine.compute(request))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary covariance matrix must be symmetric");
  }

  @Test
  void rejectsNonPositiveSemidefiniteCovariance() {
    CollisionProbabilityRequest request = new CollisionProbabilityRequest(
        CollisionProbabilityModelTest.conjunctionResult(20.0),
        java.util.List.of(
            java.util.List.of(1.0, 2.0, 0.0),
            java.util.List.of(2.0, 1.0, 0.0),
            java.util.List.of(0.0, 0.0, 1.0)),
        CollisionProbabilityModelTest.diagonal(1.0),
        1.0,
        null);

    assertThatThrownBy(() -> engine.compute(request))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary covariance matrix must be positive semidefinite");
  }
}
