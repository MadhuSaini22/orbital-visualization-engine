package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.util.List;

public record CatalogConjunctionResult(
    CatalogConjunctionRequest request,
    CatalogSatellite primarySatellite,
    List<CatalogConjunctionCandidate> candidates,
    CatalogScreeningStatistics statistics,
    ScreeningExecutionStatistics executionStatistics) {
  public CatalogConjunctionResult(
      CatalogConjunctionRequest request,
      CatalogSatellite primarySatellite,
      List<CatalogConjunctionCandidate> candidates,
      CatalogScreeningStatistics statistics) {
    this(
        request,
        primarySatellite,
        candidates,
        statistics,
        successfulExecutionStatistics(statistics));
  }

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
    if (executionStatistics == null) {
      throw new IllegalArgumentException("Catalog screening execution statistics are required");
    }
    candidates = List.copyOf(candidates);
  }

  private static ScreeningExecutionStatistics successfulExecutionStatistics(
      CatalogScreeningStatistics statistics) {
    if (statistics == null) {
      throw new IllegalArgumentException("Catalog screening statistics are required");
    }
    return new ScreeningExecutionStatistics(statistics.analyzedCandidates(), statistics.analyzedCandidates(), 0);
  }
}
