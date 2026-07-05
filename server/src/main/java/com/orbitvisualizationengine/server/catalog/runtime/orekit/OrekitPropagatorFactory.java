package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.springframework.stereotype.Component;

@Component
public class OrekitPropagatorFactory {
  private final OrekitTleFactory tleFactory;

  public OrekitPropagatorFactory(OrekitTleFactory tleFactory) {
    this.tleFactory = tleFactory;
  }

  public TLEPropagator createPropagator(CatalogSatellite satellite) {
    return createPropagator(tleFactory.createTle(satellite));
  }

  public TLEPropagator createPropagator(TLE tle) {
    try {
      return TLEPropagator.selectExtrapolator(tle);
    } catch (RuntimeException exception) {
      throw new OrekitRuntimeCatalogException("Unable to create TLE propagator", exception);
    }
  }
}
