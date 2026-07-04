package com.orbitvisualizationengine.server.catalog.runtime.mapper;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogSatelliteRecord;
import org.springframework.stereotype.Component;

@Component
public class CatalogSatelliteMapper {
  public CatalogSatellite toSatellite(CatalogSatelliteRecord record) {
    return new CatalogSatellite(
        record.noradCatalogId(),
        record.catalogVersionId(),
        record.historyId(),
        record.sourceCode(),
        record.sourceDisplayName(),
        record.objectName(),
        record.objectId(),
        record.objectType(),
        record.classification(),
        record.countryCode(),
        record.launchYear(),
        record.launchNumber(),
        record.launchPiece(),
        record.epochAt(),
        record.tleLine1(),
        record.tleLine2(),
        record.tleSha256(),
        record.elementSetNo(),
        record.ephemerisType(),
        record.inclinationDeg(),
        record.raanDeg(),
        record.eccentricity(),
        record.argumentOfPerigeeDeg(),
        record.meanAnomalyDeg(),
        record.meanMotionRevPerDay(),
        record.meanMotionDot(),
        record.meanMotionDdot(),
        record.bstar(),
        record.revolutionNumber(),
        record.firstSeenVersionId(),
        record.lastSeenVersionId(),
        record.firstSeenAt(),
        record.lastSeenAt());
  }
}
