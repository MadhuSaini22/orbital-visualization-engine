package com.orbitvisualizationengine.server.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record MissionTrajectoryRequest(
    @NotBlank String missionId,
    @NotNull Instant startTime,
    @NotNull Instant endTime,
    @Min(5) @Max(3600) int stepSeconds) {
}
