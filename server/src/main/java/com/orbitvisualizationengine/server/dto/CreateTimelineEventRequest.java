package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.TimelineEventType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.Map;

public record CreateTimelineEventRequest(
    @NotNull @Min(0) Integer sequenceIndex,
    @NotNull TimelineEventType type,
    @NotBlank String name,
    @NotNull Boolean enabled,
    @NotNull Instant executionTime,
    Map<String, Object> parameters) {
}
