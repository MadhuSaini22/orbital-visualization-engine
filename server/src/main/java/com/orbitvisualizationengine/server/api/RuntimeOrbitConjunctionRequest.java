package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Duration;
import java.time.Instant;

public record RuntimeOrbitConjunctionRequest(
    RuntimeObjectRef primaryObject,
    RuntimeObjectRef secondaryObject,
    Instant startTime,
    Instant stopTime,
    Duration step,
    RelativeFrame relativeFrame,
    double missDistanceThresholdMeters,
    PropagatorType propagatorType) {
}
