package com.orbitvisualizationengine.server.catalog.runtime;

import java.math.BigDecimal;
import java.time.Instant;

public record CatalogSatellite(
    int noradCatalogId,
    long catalogVersionId,
    long historyId,
    String sourceCode,
    String sourceDisplayName,
    String objectName,
    String objectId,
    String objectType,
    String classification,
    String countryCode,
    Integer launchYear,
    Integer launchNumber,
    String launchPiece,
    Instant epochAt,
    String tleLine1,
    String tleLine2,
    String tleSha256,
    Integer elementSetNo,
    Integer ephemerisType,
    BigDecimal inclinationDeg,
    BigDecimal raanDeg,
    BigDecimal eccentricity,
    BigDecimal argumentOfPerigeeDeg,
    BigDecimal meanAnomalyDeg,
    BigDecimal meanMotionRevPerDay,
    BigDecimal meanMotionDot,
    BigDecimal meanMotionDdot,
    BigDecimal bstar,
    Integer revolutionNumber,
    long firstSeenVersionId,
    long lastSeenVersionId,
    Instant firstSeenAt,
    Instant lastSeenAt) {
}
