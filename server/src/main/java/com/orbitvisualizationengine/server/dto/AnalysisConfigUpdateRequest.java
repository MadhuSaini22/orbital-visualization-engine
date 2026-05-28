package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record AnalysisConfigUpdateRequest(
    AnalysisPreset preset,
    PropagatorType propagatorType,
    Boolean gravityEnabled,
    @Min(0) @Max(360) Integer gravityDegree,
    @Min(0) @Max(360) Integer gravityOrder,
    Boolean dragEnabled,
    Boolean solarRadiationPressureEnabled,
    Boolean thirdBodySunEnabled,
    Boolean thirdBodyMoonEnabled,
    Boolean maneuverModelEnabled,
    String notes) {
}
