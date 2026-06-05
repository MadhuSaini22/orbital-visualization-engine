package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.PropagationProfile;
import com.orbitvisualizationengine.server.domain.NumericalIntegratorType;

public record NumericalIntegratorSettings(
    NumericalIntegratorType type,
    double minStep,
    double maxStep,
    double absTolerance,
    double relTolerance) {

  public static NumericalIntegratorSettings defaults() {
    return new NumericalIntegratorSettings(NumericalIntegratorType.DORMAND_PRINCE_853, 0.1, 120.0, 1.0, 1.0);
  }

  public static NumericalIntegratorSettings fromProfile(PropagationProfile profile) {
    return new NumericalIntegratorSettings(
        profile.integratorType(),
        profile.integratorMinStep(),
        profile.integratorMaxStep(),
        profile.integratorAbsTol(),
        profile.integratorRelTol());
  }
}
