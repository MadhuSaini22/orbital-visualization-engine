package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.util.List;
import org.orekit.orbits.Orbit;
import org.orekit.propagation.analytical.tle.TLE;

public record PropagationContext(
    int noradId,
    OrbitSeed seed,
    SatelliteAnalysisConfig analysisConfig,
    SpacecraftModel spacecraft,
    List<ManeuverEvent> maneuvers,
    List<PropagationManeuverCommand> maneuverCommands) {

  public PropagationContext(
      int noradId,
      OrbitSeed seed,
      SatelliteAnalysisConfig analysisConfig,
      SpacecraftModel spacecraft,
      List<ManeuverEvent> maneuvers) {
    this(noradId, seed, analysisConfig, spacecraft, maneuvers, List.of());
  }

  public PropagationContext(
      int noradId,
      TLE tle,
      SatelliteAnalysisConfig analysisConfig,
      SpacecraftModel spacecraft,
      List<ManeuverEvent> maneuvers) {
    this(noradId, OrbitSeed.tle(tle), analysisConfig, spacecraft, maneuvers, List.of());
  }

  public PropagationContext withManeuverCommands(List<PropagationManeuverCommand> commands) {
    return new PropagationContext(noradId, seed, analysisConfig, spacecraft, maneuvers, commands);
  }

  public PropagationContext withAnalysisConfig(SatelliteAnalysisConfig config) {
    return new PropagationContext(noradId, seed, config, SpacecraftModel.fromConfig(config), maneuvers, maneuverCommands);
  }

  public TLE tle() {
    return seed.tle();
  }

  public Orbit initialOrbit() {
    return seed.initialOrbit();
  }
}
