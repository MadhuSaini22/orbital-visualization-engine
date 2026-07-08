package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.PropagatorType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record RuntimeOrbitPropagationRequest(
    @NotNull RuntimeObjectRef primaryObject,
    @NotNull Instant start,
    @NotNull Instant end,
    @Min(5) @Max(3600) int stepSeconds,
    PropagatorType propagatorType) {
}
