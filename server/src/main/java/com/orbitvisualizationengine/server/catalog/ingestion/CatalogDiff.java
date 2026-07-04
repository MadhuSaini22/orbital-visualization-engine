package com.orbitvisualizationengine.server.catalog.ingestion;

import java.util.List;

public record CatalogDiff(
    List<NormalizedCatalogRecord> added,
    List<NormalizedCatalogRecord> changed,
    List<NormalizedCatalogRecord> unchanged,
    List<CurrentCatalogRecord> removed) {

  public int changedObjects() {
    return added.size() + changed.size();
  }
}
