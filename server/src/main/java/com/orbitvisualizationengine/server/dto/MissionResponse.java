package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Instant;

public record MissionResponse(
    String id,
    String name,
    Integer subjectNoradId,
    String subjectOrbitId,
    PropagatorType propagatorType,
    Instant scenarioStart,
    Instant scenarioEnd,
    Instant createdAt,
    Instant updatedAt) {

  public static MissionResponse from(Mission mission) {
    return new MissionResponse(
        mission.id(),
        mission.name(),
        mission.subjectNoradId(),
        mission.subjectOrbitId(),
        mission.propagatorType(),
        mission.scenarioStart(),
        mission.scenarioEnd(),
        mission.createdAt(),
        mission.updatedAt());
  }
}
