package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record ManualOrbitRecord(
    String id,
    String name,
    OrbitDefinitionType type,
    Instant epoch,
    String frame,
    String centralBody,
    String payload,
    PropagatorType propagatorType,
    Instant createdAt,
    Instant updatedAt) {
}
