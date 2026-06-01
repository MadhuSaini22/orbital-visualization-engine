package com.orbitvisualizationengine.server.propagation;

import java.time.Instant;
import java.util.Map;

public record PropagationManeuverCommand(
    String id,
    PropagationManeuverType maneuverType,
    Instant executionTimeUtc,
    double durationSeconds,
    double thrustNewton,
    double ispSeconds,
    String directionFrame,
    double directionX,
    double directionY,
    double directionZ,
    boolean enabled,
    Map<String, Object> metadata) {
}
