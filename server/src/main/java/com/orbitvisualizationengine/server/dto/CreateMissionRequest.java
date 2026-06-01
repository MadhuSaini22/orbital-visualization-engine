package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.PropagatorType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record CreateMissionRequest(
    @NotBlank String name,
    @NotNull PropagatorType propagatorType,
    @NotNull Instant scenarioStart,
    @NotNull Instant scenarioEnd) {
}
