package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record SatelliteAnalysisConfig(
    int noradId,
    AnalysisPreset preset,
    PropagatorType propagatorType,
    boolean gravityEnabled,
    int gravityDegree,
    int gravityOrder,
    boolean dragEnabled,
    boolean solarRadiationPressureEnabled,
    boolean thirdBodySunEnabled,
    boolean thirdBodyMoonEnabled,
    boolean maneuverModelEnabled,
    double dryMassKg,
    double fuelMassKg,
    double dragAreaM2,
    double dragCoefficient,
    double srpAreaM2,
    double reflectivityCoefficient,
    double nominalThrustN,
    double nominalIspS,
    String notes,
    Instant updatedAt) {
}
