package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.springframework.stereotype.Service;

@Service
public class RuntimeSatelliteService {
  private final CatalogService catalogService;
  private final OrekitTleFactory tleFactory;
  private final OrekitPropagatorFactory propagatorFactory;

  public RuntimeSatelliteService(
      CatalogService catalogService,
      OrekitTleFactory tleFactory,
      OrekitPropagatorFactory propagatorFactory) {
    this.catalogService = catalogService;
    this.tleFactory = tleFactory;
    this.propagatorFactory = propagatorFactory;
  }

  public RuntimeSatellite findByNoradId(int noradCatalogId) {
    return createRuntimeSatellite(catalogService.findByNoradId(noradCatalogId));
  }

  public RuntimeSatellite createRuntimeSatellite(CatalogSatellite satellite) {
    TLE tle = tleFactory.createTle(satellite);
    TLEPropagator propagator = propagatorFactory.createPropagator(tle);
    return new RuntimeSatellite(satellite, tle, propagator);
  }
}
