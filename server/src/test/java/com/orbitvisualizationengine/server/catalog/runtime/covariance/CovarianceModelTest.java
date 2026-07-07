package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CovarianceModelTest {
  private static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  private static final Instant STOP = Instant.parse("2026-05-08T04:57:05Z");

  @Test
  void covarianceMatrixDefensivelyCopiesValues() {
    List<List<Double>> values = mutableIdentity(6);

    CovarianceMatrix matrix = new CovarianceMatrix(values);
    values.getFirst().set(0, 42.0);

    assertThat(matrix.dimension()).isEqualTo(6);
    assertThat(matrix.valueAt(0, 0)).isEqualTo(1.0);
    assertThatThrownBy(() -> matrix.values().getFirst().set(0, 2.0))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void covarianceMatrixValidatesSquareFiniteValues() {
    assertThatThrownBy(() -> new CovarianceMatrix(List.of(List.of(1.0, 2.0))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Covariance matrix must be square");

    assertThatThrownBy(() -> new CovarianceMatrix(List.of(List.of(Double.NaN))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Covariance matrix must contain only finite values");
  }

  @Test
  void requestValidatesRuntimeInputs() {
    assertThatThrownBy(() -> new CovariancePropagationRequest(
        0,
        START,
        STOP,
        Duration.ofSeconds(60),
        identity(6)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("NORAD catalog id must be positive");

    assertThatThrownBy(() -> new CovariancePropagationRequest(
        25544,
        START,
        STOP,
        Duration.ofSeconds(60),
        identity(3)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Initial covariance must be a 6x6 Cartesian covariance matrix");
  }

  static CovariancePropagationRequest request() {
    return new CovariancePropagationRequest(
        25544,
        START,
        START.plusSeconds(120),
        Duration.ofSeconds(60),
        identity(6));
  }

  static CovarianceMatrix identity(int dimension) {
    return new CovarianceMatrix(mutableIdentity(dimension));
  }

  private static List<List<Double>> mutableIdentity(int dimension) {
    List<List<Double>> values = new ArrayList<>();
    for (int row = 0; row < dimension; row++) {
      List<Double> matrixRow = new ArrayList<>();
      for (int column = 0; column < dimension; column++) {
        matrixRow.add(row == column ? 1.0 : 0.0);
      }
      values.add(matrixRow);
    }
    return values;
  }
}
