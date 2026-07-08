package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Duration;
import java.time.Instant;

public record RuntimeOrbitCatalogScreeningRequest(
    RuntimeObjectRef primaryObject,
    Instant startTime,
    Instant stopTime,
    Duration step,
    RelativeFrame relativeFrame,
    double missDistanceThresholdMeters,
    PropagatorType propagatorType) {
}
