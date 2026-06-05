package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.NumericalIntegratorType;
import com.orbitvisualizationengine.server.domain.PropagatorType;

public record UpdatePropagationProfileRequest(
    String name,
    AnalysisPreset preset,
    PropagatorType propagatorType,
    Boolean gravityEnabled,
    Integer gravityDegree,
    Integer gravityOrder,
    Boolean dragEnabled,
    Boolean solarRadiationPressureEnabled,
    Boolean thirdBodySunEnabled,
    Boolean thirdBodyMoonEnabled,
    Boolean maneuverModelEnabled,
    NumericalIntegratorType integratorType,
    Double dryMassKg,
    Double fuelMassKg,
    Double dragAreaM2,
    Double dragCoefficient,
    Double srpAreaM2,
    Double reflectivityCoefficient,
    Double nominalThrustN,
    Double nominalIspS,
    Double integratorMinStep,
    Double integratorMaxStep,
    Double integratorAbsTol,
    Double integratorRelTol,
    String notes) {
}
