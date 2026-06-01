package com.orbitvisualizationengine.server.domain;

import java.time.Instant;
import java.util.Map;

public record MissionTimelineEvent(
    String id,
    String missionId,
    int sequenceIndex,
    TimelineEventType type,
    String name,
    boolean enabled,
    Instant executionTime,
    Map<String, Object> parameters,
    Instant createdAt,
    Instant updatedAt) {
}
