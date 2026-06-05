package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.NumericalIntegratorType;
import com.orbitvisualizationengine.server.domain.PropagationProfile;
import com.orbitvisualizationengine.server.domain.PropagationProfileOwnerType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.time.Instant;

public record PropagationProfileResponse(
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

  public static PropagationProfileResponse from(PropagationProfile profile) {
    return new PropagationProfileResponse(
        profile.id(),
        profile.ownerType(),
        profile.ownerId(),
        profile.name(),
        profile.preset(),
        profile.propagatorType(),
        profile.gravityEnabled(),
        profile.gravityDegree(),
        profile.gravityOrder(),
        profile.dragEnabled(),
        profile.solarRadiationPressureEnabled(),
        profile.thirdBodySunEnabled(),
        profile.thirdBodyMoonEnabled(),
        profile.maneuverModelEnabled(),
        profile.integratorType(),
        profile.dryMassKg(),
        profile.fuelMassKg(),
        profile.dragAreaM2(),
        profile.dragCoefficient(),
        profile.srpAreaM2(),
        profile.reflectivityCoefficient(),
        profile.nominalThrustN(),
        profile.nominalIspS(),
        profile.integratorMinStep(),
        profile.integratorMaxStep(),
        profile.integratorAbsTol(),
        profile.integratorRelTol(),
        profile.notes(),
        profile.createdAt(),
        profile.updatedAt());
  }
}
