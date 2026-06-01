package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import java.time.Instant;
import java.util.Map;

public record MissionTimelineEventResponse(
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

  public static MissionTimelineEventResponse from(MissionTimelineEvent event) {
    return new MissionTimelineEventResponse(
        event.id(),
        event.missionId(),
        event.sequenceIndex(),
        event.type(),
        event.name(),
        event.enabled(),
        event.executionTime(),
        event.parameters(),
        event.createdAt(),
        event.updatedAt());
  }
}
