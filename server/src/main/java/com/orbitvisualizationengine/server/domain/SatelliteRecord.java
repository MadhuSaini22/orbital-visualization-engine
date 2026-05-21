package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record SatelliteRecord(
    int noradId,
    String name,
    String objectType,
    String owner,
    String source,
    Instant updatedAt) {
}
