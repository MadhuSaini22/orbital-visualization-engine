package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Instant;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;
import org.springframework.stereotype.Component;

@Component
public class KeplerianPropagator extends AnalyticalPropagator {
  private final OrekitEnvironment orekit;

  public KeplerianPropagator(OrekitEnvironment orekit) {
    this.orekit = orekit;
  }

  @Override
  public String name() {
    return "OREKIT_KEPLERIAN";
  }

  @Override
  public EphemerisState propagate(PropagationContext context, Instant date) {
    TLEPropagator seedPropagator = TLEPropagator.selectExtrapolator(context.tle());
    PVCoordinates seedPv = seedPropagator.getPVCoordinates(context.tle().getDate(), orekit.eme2000());
    Orbit initialOrbit = new CartesianOrbit(seedPv, orekit.eme2000(), context.tle().getDate(), Constants.EGM96_EARTH_MU);
    org.orekit.propagation.analytical.KeplerianPropagator propagator =
        new org.orekit.propagation.analytical.KeplerianPropagator(initialOrbit);

    return OrekitStateMapper.propagateToState(
        propagator,
        date,
        orekit.itrf(),
        orekit.earth(),
        "ITRF");
  }
}
