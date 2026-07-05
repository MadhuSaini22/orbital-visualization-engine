package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import org.orekit.propagation.analytical.tle.TLE;
import org.springframework.stereotype.Service;

@Service
public class RuntimeSatelliteService {
  private final CatalogService catalogService;
  private final OrekitTleFactory tleFactory;

  public RuntimeSatelliteService(
      CatalogService catalogService,
      OrekitTleFactory tleFactory) {
    this.catalogService = catalogService;
    this.tleFactory = tleFactory;
  }

  public RuntimeSatellite findByNoradId(int noradCatalogId) {
    return createRuntimeSatellite(catalogService.findByNoradId(noradCatalogId));
  }

  public RuntimeSatellite createRuntimeSatellite(CatalogSatellite satellite) {
    TLE tle = tleFactory.createTle(satellite);
    return new RuntimeSatellite(satellite, tle);
  }
}
