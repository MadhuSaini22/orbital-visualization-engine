package com.orbitvisualizationengine.server.service;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class TargetingService {

  public DifferentialCorrectorCapability capability() {
    return new DifferentialCorrectorCapability(
        "FOUNDATION",
        "Finite-difference differential corrector over propagated residuals.",
        List.of("impulsiveDeltaV", "burnEpoch", "finiteBurnDuration", "thrustDirection"),
        List.of("altitude", "inclination", "eccentricity", "raan", "argumentOfPerigee"),
        List.of("Orekit propagator reset", "mission event replay", "finite-difference sensitivity estimation", "residual convergence criteria")
    );
  }

  public TargetingResult notConfiguredResult(List<ControlVariable> controls, List<AchieveVariable> objectives) {
    return new TargetingResult(
        "NOT_CONFIGURED",
        controls,
        objectives,
        List.of(),
        Map.of(),
        List.of("Targeting service foundation is registered. Solver execution will be implemented in a future sprint.")
    );
  }
}
