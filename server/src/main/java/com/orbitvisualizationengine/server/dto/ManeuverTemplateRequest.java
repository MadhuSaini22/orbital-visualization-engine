package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.ManeuverTemplateType;
import com.orbitvisualizationengine.server.domain.PlaneChangeExecutionStrategy;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ManeuverTemplateRequest(
    @NotNull ManeuverTemplateType type,
    Double targetAltitudeKm,
    Double inclinationChangeDeg,
    PlaneChangeExecutionStrategy executionStrategy,
    @Min(0) Integer sequenceIndex) {
}
