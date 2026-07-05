package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

public record CatalogScreeningStatistics(
    long catalogSatellitesSeen,
    long skippedPrimarySatellites,
    long analyzedCandidates,
    long conjunctionCandidates,
    long clearCandidates) {
  public CatalogScreeningStatistics {
    if (catalogSatellitesSeen < 0) {
      throw new IllegalArgumentException("Catalog satellites seen must be non-negative");
    }
    if (skippedPrimarySatellites < 0) {
      throw new IllegalArgumentException("Skipped primary satellites must be non-negative");
    }
    if (analyzedCandidates < 0) {
      throw new IllegalArgumentException("Analyzed candidates must be non-negative");
    }
    if (conjunctionCandidates < 0) {
      throw new IllegalArgumentException("Conjunction candidates must be non-negative");
    }
    if (clearCandidates < 0) {
      throw new IllegalArgumentException("Clear candidates must be non-negative");
    }
    if (catalogSatellitesSeen != skippedPrimarySatellites + analyzedCandidates) {
      throw new IllegalArgumentException("Catalog satellites seen must equal skipped plus analyzed candidates");
    }
    if (analyzedCandidates != conjunctionCandidates + clearCandidates) {
      throw new IllegalArgumentException("Analyzed candidates must equal conjunction plus clear candidates");
    }
  }
}
