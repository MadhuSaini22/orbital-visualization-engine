package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionModelTest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CollisionProbabilityModelTest {
  @Test
  void requestDefaultsMethodAndDefensivelyCopiesCovariances() {
    List<List<Double>> primaryCovariance = mutableDiagonal(25.0);
    List<List<Double>> secondaryCovariance = mutableDiagonal(75.0);

    CollisionProbabilityRequest request = new CollisionProbabilityRequest(
        conjunctionResult(20.0),
        primaryCovariance,
        secondaryCovariance,
        2.0,
        null);
    primaryCovariance.getFirst().set(0, 999.0);

    assertThat(request.method()).isEqualTo(CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE);
    assertThat(request.primaryCovarianceMetersSquared().getFirst().getFirst()).isEqualTo(25.0);
    assertThatThrownBy(() -> request.primaryCovarianceMetersSquared().getFirst().set(0, 1.0))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void requestValidatesInputs() {
    assertThatThrownBy(() -> new CollisionProbabilityRequest(
        null,
        diagonal(1.0),
        diagonal(1.0),
        1.0,
        null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Conjunction result is required");

    assertThatThrownBy(() -> new CollisionProbabilityRequest(
        conjunctionResult(20.0),
        List.of(List.of(1.0)),
        diagonal(1.0),
        1.0,
        null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary covariance matrix must be a 3x3 matrix");

    assertThatThrownBy(() -> new CollisionProbabilityRequest(
        conjunctionResult(20.0),
        diagonal(1.0),
        diagonal(1.0),
        0.0,
        null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Hard-body radius must be positive");
  }

  @Test
  void resultValidatesProbabilityRange() {
    CollisionProbabilityRequest request = request(20.0, 2.0);

    assertThatThrownBy(() -> new CollisionProbabilityResult(
        request,
        1.1,
        new CollisionProbabilityStatistics(
            request.method(),
            100.0,
            10.0,
            2.0,
            0.2)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Probability of collision must be between 0 and 1");
  }

  static CollisionProbabilityRequest request(double missDistanceMeters, double hardBodyRadiusMeters) {
    return new CollisionProbabilityRequest(
        conjunctionResult(missDistanceMeters),
        diagonal(25.0),
        diagonal(75.0),
        hardBodyRadiusMeters,
        null);
  }

  static ConjunctionResult conjunctionResult(double missDistanceMeters) {
    RelativeState state = ConjunctionModelTest.relativeState(
        ConjunctionModelTest.START,
        missDistanceMeters,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0);
    return new ConjunctionResult(
        ConjunctionModelTest.request(1000.0),
        new ClosestApproach(
            ConjunctionModelTest.START,
            missDistanceMeters,
            1.0,
            state),
        ConjunctionStatus.CONJUNCTION);
  }

  static List<List<Double>> diagonal(double value) {
    return List.of(
        List.of(value, 0.0, 0.0),
        List.of(0.0, value, 0.0),
        List.of(0.0, 0.0, value));
  }

  private static List<List<Double>> mutableDiagonal(double value) {
    List<List<Double>> matrix = new ArrayList<>();
    matrix.add(new ArrayList<>(List.of(value, 0.0, 0.0)));
    matrix.add(new ArrayList<>(List.of(0.0, value, 0.0)));
    matrix.add(new ArrayList<>(List.of(0.0, 0.0, value)));
    return matrix;
  }
}
