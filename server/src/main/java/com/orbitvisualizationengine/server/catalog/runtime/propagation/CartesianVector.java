package com.orbitvisualizationengine.server.catalog.runtime.propagation;

public record CartesianVector(
    double xMeters,
    double yMeters,
    double zMeters) {
  public CartesianVector {
    requireFinite(xMeters, "xMeters");
    requireFinite(yMeters, "yMeters");
    requireFinite(zMeters, "zMeters");
  }

  private static void requireFinite(double value, String fieldName) {
    if (!Double.isFinite(value)) {
      throw new IllegalArgumentException(fieldName + " must be finite");
    }
  }
}
