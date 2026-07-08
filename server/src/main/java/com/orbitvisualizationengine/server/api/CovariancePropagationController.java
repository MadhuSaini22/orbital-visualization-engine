package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationRequest;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceMatrix;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceState;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/covariance")
public class CovariancePropagationController {
  private final CovariancePropagationService covariancePropagationService;

  public CovariancePropagationController(CovariancePropagationService covariancePropagationService) {
    this.covariancePropagationService = covariancePropagationService;
  }

  @PostMapping("/propagate")
  RuntimeCovariancePropagationResponse propagate(@Valid @RequestBody CovariancePropagationRequest request) {
    return RuntimeCovariancePropagationResponse.from(covariancePropagationService.propagate(request));
  }

  @PostMapping("/propagate/orbit")
  RuntimeOrbitCovariancePropagationResponse propagateOrbit(
      @Valid @RequestBody RuntimeOrbitCovariancePropagationRequest request) {
    List<CovarianceState> states = new ArrayList<>();
    for (Instant sampleTime : sampleTimes(request.startTime(), request.stopTime(), request.step())) {
      states.add(new CovarianceState(
          sampleTime,
          propagateCovariance(
              request.initialCovariance(),
              secondsBetween(request.startTime(), sampleTime))));
    }
    return new RuntimeOrbitCovariancePropagationResponse(request, request.primaryObject(), List.copyOf(states));
  }

  private static CovarianceMatrix propagateCovariance(
      CovarianceMatrix initialCovariance,
      double elapsedSeconds) {
    double[][] transition = cartesianTransition(elapsedSeconds);
    double[][] propagated = multiply(multiply(transition, toArray(initialCovariance)), transpose(transition));
    return CovarianceMatrix.of(symmetrize(propagated));
  }

  private static double[][] cartesianTransition(double elapsedSeconds) {
    double[][] transition = new double[6][6];
    for (int index = 0; index < 6; index++) {
      transition[index][index] = 1.0;
    }
    transition[0][3] = elapsedSeconds;
    transition[1][4] = elapsedSeconds;
    transition[2][5] = elapsedSeconds;
    return transition;
  }

  private static double[][] toArray(CovarianceMatrix matrix) {
    double[][] values = new double[matrix.dimension()][matrix.dimension()];
    for (int row = 0; row < matrix.dimension(); row++) {
      for (int column = 0; column < matrix.dimension(); column++) {
        values[row][column] = matrix.valueAt(row, column);
      }
    }
    return values;
  }

  private static double[][] multiply(double[][] left, double[][] right) {
    double[][] result = new double[left.length][right[0].length];
    for (int row = 0; row < left.length; row++) {
      for (int column = 0; column < right[0].length; column++) {
        double value = 0.0;
        for (int inner = 0; inner < right.length; inner++) {
          value += left[row][inner] * right[inner][column];
        }
        result[row][column] = value;
      }
    }
    return result;
  }

  private static double[][] transpose(double[][] matrix) {
    double[][] result = new double[matrix[0].length][matrix.length];
    for (int row = 0; row < matrix.length; row++) {
      for (int column = 0; column < matrix[0].length; column++) {
        result[column][row] = matrix[row][column];
      }
    }
    return result;
  }

  private static double[][] symmetrize(double[][] matrix) {
    double[][] result = new double[matrix.length][matrix.length];
    for (int row = 0; row < matrix.length; row++) {
      for (int column = 0; column < matrix.length; column++) {
        result[row][column] = (matrix[row][column] + matrix[column][row]) / 2.0;
      }
    }
    return result;
  }

  private static List<Instant> sampleTimes(
      Instant startTime,
      Instant stopTime,
      Duration step) {
    List<Instant> samples = new ArrayList<>();
    Instant cursor = startTime;
    while (cursor.isBefore(stopTime)) {
      samples.add(cursor);
      Instant next = cursor.plus(step);
      if (!next.isAfter(cursor)) {
        throw new IllegalArgumentException("Step duration does not advance the propagation time");
      }
      cursor = next.isAfter(stopTime) ? stopTime : next;
    }
    samples.add(stopTime);
    return List.copyOf(samples);
  }

  private static double secondsBetween(Instant startTime, Instant sampleTime) {
    return Duration.between(startTime, sampleTime).toNanos() / 1.0e9;
  }
}
