package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.ManeuverTemplateType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ManeuverTemplateRequest(
    @NotNull ManeuverTemplateType type,
    @NotNull Double targetAltitudeKm,
    @Min(0) Integer sequenceIndex) {
}
