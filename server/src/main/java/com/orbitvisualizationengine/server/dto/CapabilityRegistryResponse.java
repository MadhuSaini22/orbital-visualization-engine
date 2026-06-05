package com.orbitvisualizationengine.server.dto;

import java.util.List;

public record CapabilityRegistryResponse(
    List<PropagatorCapability> propagators,
    List<IntegratorCapability> integrators,
    List<ForceModelCapability> forceModels,
    ManeuverCapability maneuverSupport,
    List<String> spacecraftParameters) {

  public record PropagatorCapability(
      String id,
      String label,
      String description,
      boolean supportsIntegrators,
      boolean supportsForceModels,
      boolean supportsManeuvers,
      boolean supportsSpacecraftParameters) {
  }

  public record IntegratorCapability(
      String id,
      String label,
      String description,
      boolean adaptiveStep,
      String backendClass) {
  }

  public record ForceModelCapability(
      String id,
      String label,
      String description,
      boolean implemented,
      boolean numericalOnly) {
  }

  public record ManeuverCapability(
      boolean finiteBurn,
      boolean impulsiveBurn,
      boolean vectorBurn,
      String notes) {
  }
}
