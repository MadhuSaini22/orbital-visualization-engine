package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import org.orekit.propagation.analytical.tle.TLE;
import org.springframework.stereotype.Component;

@Component
public class OrekitTleFactory {
  public TLE createTle(CatalogSatellite satellite) {
    if (satellite == null) {
      throw new InvalidCatalogTleException(0, "catalog satellite is required");
    }
    String line1 = normalizeLine(satellite.noradCatalogId(), satellite.tleLine1(), "line 1");
    String line2 = normalizeLine(satellite.noradCatalogId(), satellite.tleLine2(), "line 2");
    validateLinePrefixes(satellite.noradCatalogId(), line1, line2);
    validateSatelliteNumbers(satellite.noradCatalogId(), line1, line2);

    try {
      return new TLE(line1, line2);
    } catch (RuntimeException exception) {
      throw new InvalidCatalogTleException(satellite.noradCatalogId(), exception.getMessage(), exception);
    }
  }

  private String normalizeLine(int noradCatalogId, String line, String label) {
    if (line == null || line.isBlank()) {
      throw new InvalidCatalogTleException(noradCatalogId, "TLE " + label + " is required");
    }
    String normalized = line.trim();
    if (normalized.length() != 69) {
      throw new InvalidCatalogTleException(
          noradCatalogId,
          "TLE " + label + " must be exactly 69 characters");
    }
    return normalized;
  }

  private void validateLinePrefixes(int noradCatalogId, String line1, String line2) {
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      throw new InvalidCatalogTleException(noradCatalogId, "lines must start with '1 ' and '2 '");
    }
  }

  private void validateSatelliteNumbers(int noradCatalogId, String line1, String line2) {
    String line1SatelliteNumber = line1.substring(2, 7);
    String line2SatelliteNumber = line2.substring(2, 7);
    if (!line1SatelliteNumber.equals(line2SatelliteNumber)) {
      throw new InvalidCatalogTleException(noradCatalogId, "line satellite numbers do not match");
    }
    if (!line1SatelliteNumber.equals(String.format("%05d", noradCatalogId))) {
      throw new InvalidCatalogTleException(noradCatalogId, "line satellite number does not match catalog NORAD id");
    }
  }
}
