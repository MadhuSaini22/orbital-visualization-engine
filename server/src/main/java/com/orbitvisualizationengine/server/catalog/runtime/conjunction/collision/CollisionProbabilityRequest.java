package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import java.util.List;

public record CollisionProbabilityRequest(
    ConjunctionResult conjunctionResult,
    List<List<Double>> primaryCovarianceMetersSquared,
    List<List<Double>> secondaryCovarianceMetersSquared,
    double hardBodyRadiusMeters,
    CollisionProbabilityMethod method) {
  public CollisionProbabilityRequest {
    if (conjunctionResult == null) {
      throw new IllegalArgumentException("Conjunction result is required");
    }
    primaryCovarianceMetersSquared = immutableCovariance(
        primaryCovarianceMetersSquared,
        "Primary covariance matrix");
    secondaryCovarianceMetersSquared = immutableCovariance(
        secondaryCovarianceMetersSquared,
        "Secondary covariance matrix");
    if (!Double.isFinite(hardBodyRadiusMeters)) {
      throw new IllegalArgumentException("Hard-body radius must be finite");
    }
    if (hardBodyRadiusMeters <= 0.0) {
      throw new IllegalArgumentException("Hard-body radius must be positive");
    }
    if (method == null) {
      method = CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE;
    }
  }

  private static List<List<Double>> immutableCovariance(
      List<List<Double>> covariance,
      String name) {
    if (covariance == null) {
      throw new IllegalArgumentException(name + " is required");
    }
    if (covariance.size() != 3) {
      throw new IllegalArgumentException(name + " must be a 3x3 matrix");
    }
    return covariance.stream()
        .map(row -> immutableRow(row, name))
        .toList();
  }

  private static List<Double> immutableRow(List<Double> row, String name) {
    if (row == null || row.size() != 3) {
      throw new IllegalArgumentException(name + " must be a 3x3 matrix");
    }
    return List.copyOf(row.stream()
        .map(value -> finiteValue(value, name))
        .toList());
  }

  private static Double finiteValue(Double value, String name) {
    if (value == null || !Double.isFinite(value)) {
      throw new IllegalArgumentException(name + " must contain only finite values");
    }
    return value;
  }
}
