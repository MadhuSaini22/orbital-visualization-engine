package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Duration;
import java.time.Instant;

public record RuntimeOrbitVisibilityRequest(
    RuntimeObjectRef primaryObject,
    GroundStationId groundStationId,
    Instant startTime,
    Instant stopTime,
    Duration step,
    double minimumElevationDegrees,
    PropagatorType propagatorType) {
}
