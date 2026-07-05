package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.util.List;

public record CatalogConjunctionResult(
    CatalogConjunctionRequest request,
    CatalogSatellite primarySatellite,
    List<CatalogConjunctionCandidate> candidates,
    CatalogScreeningStatistics statistics) {
  public CatalogConjunctionResult {
    if (request == null) {
      throw new IllegalArgumentException("Catalog conjunction request is required");
    }
    if (primarySatellite == null) {
      throw new IllegalArgumentException("Primary satellite is required");
    }
    if (candidates == null) {
      throw new IllegalArgumentException("Catalog conjunction candidates are required");
    }
    if (statistics == null) {
      throw new IllegalArgumentException("Catalog screening statistics are required");
    }
    candidates = List.copyOf(candidates);
  }
}
