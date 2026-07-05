package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;

public interface CatalogConjunctionEngine {
  CatalogConjunctionResult screen(
      CatalogConjunctionRequest request,
      CatalogSatellite primarySatellite);
}
