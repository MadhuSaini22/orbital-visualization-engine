package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Instant;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.springframework.stereotype.Component;

@Component
public class SGP4Propagator extends AnalyticalPropagator {
  private final OrekitEnvironment orekit;

  public SGP4Propagator(OrekitEnvironment orekit) {
    this.orekit = orekit;
  }

  @Override
  public String name() {
    return "OREKIT_TLE_SGP4";
  }

  @Override
  public EphemerisState propagate(PropagationContext context, Instant date) {
    if (!context.seed().isTle()) {
      throw new IllegalArgumentException("SGP4 propagation requires a TLE orbit definition.");
    }
    return OrekitStateMapper.propagateToState(
        TLEPropagator.selectExtrapolator(context.tle()),
        date,
        orekit.itrf(),
        orekit.earth(),
        "ITRF");
  }
}
