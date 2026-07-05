package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;

public record RuntimeSatellite(
    CatalogSatellite catalogSatellite,
    TLE tle,
    TLEPropagator propagator) {
  public RuntimeSatellite {
    if (catalogSatellite == null) {
      throw new IllegalArgumentException("Catalog satellite is required");
    }
    if (tle == null) {
      throw new IllegalArgumentException("Orekit TLE is required");
    }
    if (propagator == null) {
      throw new IllegalArgumentException("TLE propagator is required");
    }
  }
}
