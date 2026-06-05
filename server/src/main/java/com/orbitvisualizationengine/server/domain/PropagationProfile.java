package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record PropagationProfile(
    String id,
    PropagationProfileOwnerType ownerType,
    String ownerId,
    String name,
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
    NumericalIntegratorType integratorType,
    double dryMassKg,
    double fuelMassKg,
    double dragAreaM2,
    double dragCoefficient,
    double srpAreaM2,
    double reflectivityCoefficient,
    double nominalThrustN,
    double nominalIspS,
    double integratorMinStep,
    double integratorMaxStep,
    double integratorAbsTol,
    double integratorRelTol,
    String notes,
    Instant createdAt,
    Instant updatedAt) {

  public SatelliteAnalysisConfig toAnalysisConfig(int noradId) {
    return new SatelliteAnalysisConfig(
        noradId,
        preset,
        propagatorType,
        gravityEnabled,
        gravityDegree,
        gravityOrder,
        dragEnabled,
        solarRadiationPressureEnabled,
        thirdBodySunEnabled,
        thirdBodyMoonEnabled,
        maneuverModelEnabled,
        dryMassKg,
        fuelMassKg,
        dragAreaM2,
        dragCoefficient,
        srpAreaM2,
        reflectivityCoefficient,
        nominalThrustN,
        nominalIspS,
        notes,
        updatedAt);
  }
}
