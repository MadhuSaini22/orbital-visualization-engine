package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionCandidate;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogScreeningStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.ScreeningExecutionStatistics;
import java.util.List;

public record RuntimeOrbitCatalogScreeningResult(
    RuntimeOrbitCatalogScreeningRequest request,
    RuntimeObjectRef primaryObject,
    List<CatalogConjunctionCandidate> candidates,
    CatalogScreeningStatistics statistics,
    ScreeningExecutionStatistics executionStatistics) {
  public RuntimeOrbitCatalogScreeningResult {
    if (request == null) {
      throw new IllegalArgumentException("Runtime catalog screening request is required");
    }
    if (primaryObject == null) {
      throw new IllegalArgumentException("Primary runtime object is required");
    }
    if (candidates == null) {
      throw new IllegalArgumentException("Catalog conjunction candidates are required");
    }
    if (statistics == null) {
      throw new IllegalArgumentException("Catalog screening statistics are required");
    }
    if (executionStatistics == null) {
      throw new IllegalArgumentException("Catalog screening execution statistics are required");
    }
    candidates = List.copyOf(candidates);
  }
}
