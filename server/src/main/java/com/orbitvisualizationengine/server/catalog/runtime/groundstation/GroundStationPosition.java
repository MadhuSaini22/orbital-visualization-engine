package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

public record GroundStationPosition(
    double latitudeDegrees,
    double longitudeDegrees,
    double altitudeMeters) {
  public GroundStationPosition {
    requireFinite(latitudeDegrees, "Latitude");
    requireFinite(longitudeDegrees, "Longitude");
    requireFinite(altitudeMeters, "Altitude");
    if (latitudeDegrees < -90.0 || latitudeDegrees > 90.0) {
      throw new IllegalArgumentException("Latitude must be between -90 and 90 degrees");
    }
    if (longitudeDegrees < -180.0 || longitudeDegrees > 180.0) {
      throw new IllegalArgumentException("Longitude must be between -180 and 180 degrees");
    }
  }

  private static void requireFinite(double value, String label) {
    if (!Double.isFinite(value)) {
      throw new IllegalArgumentException(label + " must be finite");
    }
  }
}
