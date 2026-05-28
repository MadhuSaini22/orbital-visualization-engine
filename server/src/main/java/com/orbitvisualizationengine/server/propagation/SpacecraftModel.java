package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;

public record SpacecraftModel(
    double dryMassKg,
    double fuelMassKg,
    double dragAreaM2,
    double dragCoefficient,
    double srpAreaM2,
    double reflectivityCoefficient,
    double nominalThrustN,
    double nominalIspS) {

  public double wetMassKg() {
    return dryMassKg + fuelMassKg;
  }

  public static SpacecraftModel fromConfig(SatelliteAnalysisConfig config) {
    return new SpacecraftModel(
        config.dryMassKg(),
        config.fuelMassKg(),
        config.dragAreaM2(),
        config.dragCoefficient(),
        config.srpAreaM2(),
        config.reflectivityCoefficient(),
        config.nominalThrustN(),
        config.nominalIspS());
  }
}
