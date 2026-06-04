package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.PropagationProfile;

public record NumericalIntegratorSettings(
    double minStep,
    double maxStep,
    double absTolerance,
    double relTolerance) {

  public static NumericalIntegratorSettings defaults() {
    return new NumericalIntegratorSettings(0.1, 120.0, 1.0, 1.0);
  }

  public static NumericalIntegratorSettings fromProfile(PropagationProfile profile) {
    return new NumericalIntegratorSettings(
        profile.integratorMinStep(),
        profile.integratorMaxStep(),
        profile.integratorAbsTol(),
        profile.integratorRelTol());
  }
}
