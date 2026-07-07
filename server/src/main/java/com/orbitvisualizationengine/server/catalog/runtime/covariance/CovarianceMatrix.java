package com.orbitvisualizationengine.server.catalog.runtime.covariance;

import java.util.List;

public record CovarianceMatrix(List<List<Double>> values) {
  public CovarianceMatrix {
    if (values == null || values.isEmpty()) {
      throw new IllegalArgumentException("Covariance matrix values are required");
    }
    int dimension = values.size();
    values = values.stream()
        .map(row -> immutableRow(row, dimension))
        .toList();
  }

  public static CovarianceMatrix of(double[][] values) {
    if (values == null) {
      throw new IllegalArgumentException("Covariance matrix values are required");
    }
    return new CovarianceMatrix(java.util.Arrays.stream(values)
        .map(row -> java.util.Arrays.stream(row).boxed().toList())
        .toList());
  }

  public int dimension() {
    return values.size();
  }

  public double valueAt(int row, int column) {
    return values.get(row).get(column);
  }

  private static List<Double> immutableRow(List<Double> row, int dimension) {
    if (row == null || row.size() != dimension) {
      throw new IllegalArgumentException("Covariance matrix must be square");
    }
    return List.copyOf(row.stream()
        .map(CovarianceMatrix::finiteValue)
        .toList());
  }

  private static Double finiteValue(Double value) {
    if (value == null || !Double.isFinite(value)) {
      throw new IllegalArgumentException("Covariance matrix must contain only finite values");
    }
    return value;
  }
}
