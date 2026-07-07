package com.orbitvisualizationengine.server.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record RuntimePropagationRequest(
    @NotNull Integer noradCatalogId,
    @NotNull Instant start,
    @NotNull Instant end,
    @Min(5) @Max(3600) int stepSeconds,
    String model) {
}
