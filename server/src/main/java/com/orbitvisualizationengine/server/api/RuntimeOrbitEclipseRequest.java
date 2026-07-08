package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Duration;
import java.time.Instant;

public record RuntimeOrbitEclipseRequest(
    RuntimeObjectRef primaryObject,
    Instant startTime,
    Instant stopTime,
    Duration step,
    PropagatorType propagatorType) {
}
