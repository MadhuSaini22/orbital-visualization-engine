package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

@Component
public class DefaultSpatialIndexEngine implements SpatialIndexEngine {
  private final CatalogService catalogService;
  private final SpatialIndexBuilder spatialIndexBuilder;

  public DefaultSpatialIndexEngine(
      CatalogService catalogService,
      SpatialIndexBuilder spatialIndexBuilder) {
    this.catalogService = catalogService;
    this.spatialIndexBuilder = spatialIndexBuilder;
  }

  @Override
  public SpatialCandidateResult findCandidates(CatalogSatellite primarySatellite) {
    if (primarySatellite == null) {
      throw new IllegalArgumentException("Primary satellite is required");
    }

    try (Stream<CatalogSatellite> satellites = catalogService.stream()) {
      SpatialIndex index = spatialIndexBuilder.build(satellites);
      return index.query(new SpatialIndexQuery(primarySatellite));
    }
  }
}
