package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record ConjunctionRecord(
    String id,
    Integer sat1NoradId,
    Integer sat2NoradId,
    String sat1Name,
    String sat2Name,
    Instant createdAt,
    Instant tca,
    Double missDistanceKm,
    Double probabilityOfCollision,
    Double relativeVelocityKmps,
    RiskLevel risk,
    String source,
    String rawCdm) {
}
