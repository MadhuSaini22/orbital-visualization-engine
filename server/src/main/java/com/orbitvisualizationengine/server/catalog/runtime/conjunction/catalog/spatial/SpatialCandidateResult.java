package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.util.List;

public record SpatialCandidateResult(
    List<SpatialCandidate> candidates,
    long spatialCandidatesSeen,
    long skippedPrimarySatellites) {
  public SpatialCandidateResult {
    if (candidates == null) {
      throw new IllegalArgumentException("Spatial candidates are required");
    }
    if (spatialCandidatesSeen < 0) {
      throw new IllegalArgumentException("Spatial candidates seen must be non-negative");
    }
    if (skippedPrimarySatellites < 0) {
      throw new IllegalArgumentException("Skipped primary satellites must be non-negative");
    }
    if (spatialCandidatesSeen != candidates.size() + skippedPrimarySatellites) {
      throw new IllegalArgumentException("Spatial candidates seen must equal candidates plus skipped primary satellites");
    }
    candidates = List.copyOf(candidates);
  }

  public List<CatalogSatellite> satellites() {
    return candidates.stream()
        .map(SpatialCandidate::satellite)
        .toList();
  }
}
