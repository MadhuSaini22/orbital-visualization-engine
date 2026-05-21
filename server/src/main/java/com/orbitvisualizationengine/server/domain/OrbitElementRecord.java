package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record OrbitElementRecord(
    String id,
    int noradId,
    String format,
    Instant epoch,
    String rawPayload,
    Instant ingestedAt) {
}
