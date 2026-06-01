package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.TimelineEventType;
import java.time.Instant;
import java.util.Map;

public record UpdateTimelineEventRequest(
    TimelineEventType type,
    String name,
    Boolean enabled,
    Instant executionTime,
    Map<String, Object> parameters) {
}
