package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import org.springframework.stereotype.Service;

@Service
public class CatalogConjunctionService {
  private final CatalogService catalogService;
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final CatalogConjunctionEngine catalogConjunctionEngine;

  public CatalogConjunctionService(
      CatalogService catalogService,
      RuntimeSatelliteService runtimeSatelliteService,
      CatalogConjunctionEngine catalogConjunctionEngine) {
    this.catalogService = catalogService;
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.catalogConjunctionEngine = catalogConjunctionEngine;
  }

  public CatalogConjunctionResult screen(CatalogConjunctionRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Catalog conjunction request is required");
    }

    runtimeSatelliteService.findByNoradId(request.primaryNoradCatalogId());
    CatalogSatellite primarySatellite = catalogService.findByNoradId(request.primaryNoradCatalogId());
    return catalogConjunctionEngine.screen(request, primarySatellite);
  }
}
