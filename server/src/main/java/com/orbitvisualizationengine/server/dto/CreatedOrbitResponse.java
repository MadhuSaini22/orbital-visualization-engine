package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Instant;
import java.util.List;

public record CreatedOrbitResponse(
    String id,
    String name,
    OrbitDefinitionType type,
    Instant epoch,
    String frame,
    String centralBody,
    PropagatorType propagatorType,
    List<String> warnings) {

  public static CreatedOrbitResponse from(ManualOrbitRecord orbit, List<String> warnings) {
    return new CreatedOrbitResponse(
        orbit.id(),
        orbit.name(),
        orbit.type(),
        orbit.epoch(),
        orbit.frame(),
        orbit.centralBody(),
        orbit.propagatorType(),
        warnings);
  }
}
