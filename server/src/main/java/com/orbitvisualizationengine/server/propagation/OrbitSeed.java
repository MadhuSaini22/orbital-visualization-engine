package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import java.time.Instant;
import org.orekit.orbits.Orbit;
import org.orekit.propagation.analytical.tle.TLE;

public record OrbitSeed(
    OrbitDefinitionType type,
    Instant epoch,
    String frame,
    String centralBody,
    TLE tle,
    Orbit initialOrbit) {

  public static OrbitSeed tle(TLE tle) {
    return new OrbitSeed(OrbitDefinitionType.TLE, null, "TEME", "EARTH", tle, null);
  }

  public boolean isTle() {
    return type == OrbitDefinitionType.TLE;
  }
}
