package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class LegacyManeuverCommandAdapter {
  public PropagationManeuverCommand fromLegacy(ManeuverEvent maneuver, SpacecraftModel spacecraft) {
    double[] direction = normalizedDirection(maneuver.vector());
    double thrust = numericMetadata(maneuver, "thrustN", spacecraft.nominalThrustN());
    double isp = numericMetadata(maneuver, "ispS", spacecraft.nominalIspS());
    return new PropagationManeuverCommand(
        maneuver.id(),
        PropagationManeuverType.FINITE_BURN,
        maneuver.eventTime(),
        maneuver.durationSec(),
        thrust,
        isp,
        maneuver.frame(),
        direction[0],
        direction[1],
        direction[2],
        0.0,
        0.0,
        0.0,
        true,
        maneuver.metadata());
  }

  private double[] normalizedDirection(Map<String, Double> vector) {
    double x = vector.getOrDefault("r", vector.getOrDefault("x", 0.0));
    double y = vector.getOrDefault("t", vector.getOrDefault("y", 1.0));
    double z = vector.getOrDefault("n", vector.getOrDefault("z", 0.0));
    double norm = Math.sqrt(x * x + y * y + z * z);
    if (norm == 0.0) {
      return new double[] {0.0, 1.0, 0.0};
    }
    return new double[] {x / norm, y / norm, z / norm};
  }

  private double numericMetadata(ManeuverEvent maneuver, String key, double fallback) {
    Object value = maneuver.metadata().get(key);
    return value instanceof Number number ? number.doubleValue() : fallback;
  }
}
