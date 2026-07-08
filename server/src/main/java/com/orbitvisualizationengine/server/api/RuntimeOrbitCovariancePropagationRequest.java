package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceMatrix;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Duration;
import java.time.Instant;

public record RuntimeOrbitCovariancePropagationRequest(
    RuntimeObjectRef primaryObject,
    Instant startTime,
    Instant stopTime,
    Duration step,
    CovarianceMatrix initialCovariance,
    PropagatorType propagatorType) {
}
