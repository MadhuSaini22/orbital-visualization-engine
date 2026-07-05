package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;

public record CatalogConjunctionCandidate(
    CatalogSatellite satellite,
    ConjunctionResult conjunctionResult) {
  public CatalogConjunctionCandidate {
    if (satellite == null) {
      throw new IllegalArgumentException("Candidate satellite is required");
    }
    if (conjunctionResult == null) {
      throw new IllegalArgumentException("Conjunction result is required");
    }
  }
}
