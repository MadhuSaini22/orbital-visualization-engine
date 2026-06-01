package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record Mission(
    String id,
    String name,
    Integer subjectNoradId,
    PropagatorType propagatorType,
    Instant scenarioStart,
    Instant scenarioEnd,
    Instant createdAt,
    Instant updatedAt) {
}
