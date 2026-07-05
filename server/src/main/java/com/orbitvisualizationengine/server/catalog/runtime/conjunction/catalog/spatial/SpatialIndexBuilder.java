package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.util.stream.Stream;

public interface SpatialIndexBuilder {
  SpatialIndex build(Stream<CatalogSatellite> satellites);
}
