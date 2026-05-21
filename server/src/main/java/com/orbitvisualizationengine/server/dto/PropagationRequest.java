package com.orbitvisualizationengine.server.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record PropagationRequest(
    @NotNull Integer noradId,
    @NotNull Instant start,
    @NotNull Instant end,
    @Min(5) @Max(3600) int stepSeconds,
    String model) {
}
