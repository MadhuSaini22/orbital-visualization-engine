package com.orbitvisualizationengine.server.propagation;

import java.util.Locale;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.orekit.attitudes.AttitudeProvider;
import org.orekit.attitudes.LofOffset;
import org.orekit.forces.maneuvers.ConstantThrustManeuver;
import org.orekit.forces.maneuvers.ImpulseManeuver;
import org.orekit.frames.LOFType;
import org.orekit.propagation.events.DateDetector;
import org.springframework.stereotype.Component;

@Component
public class OrekitManeuverFactory {
  private final OrekitEnvironment orekit;

  public OrekitManeuverFactory(OrekitEnvironment orekit) {
    this.orekit = orekit;
  }

  public ConstantThrustManeuver constantThrust(PropagationManeuverCommand command) {
    Vector3D direction = thrustDirection(command);
    AttitudeProvider attitude = attitudeProvider(command.directionFrame());
    return new ConstantThrustManeuver(
        OrekitStateMapper.toAbsoluteDate(command.executionTimeUtc()),
        command.durationSeconds(),
        command.thrustNewton(),
        command.ispSeconds(),
        attitude,
        direction,
        "burn-" + command.id());
  }

  public ImpulseManeuver impulse(PropagationManeuverCommand command) {
    AttitudeProvider attitude = attitudeProvider(command.directionFrame());
    Vector3D deltaV = new Vector3D(command.deltaVxMps(), command.deltaVyMps(), command.deltaVzMps());
    return new ImpulseManeuver(
        new DateDetector(OrekitStateMapper.toAbsoluteDate(command.executionTimeUtc())),
        attitude,
        deltaV,
        command.ispSeconds());
  }

  private AttitudeProvider attitudeProvider(String frame) {
    String normalized = frame == null ? "" : frame.trim().toUpperCase(Locale.ROOT);
    if ("RTN".equals(normalized) || "RSW".equals(normalized) || "QSW".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.QSW);
    }
    if ("TNW".equals(normalized) || "VNC".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.TNW);
    }
    if ("LVLH".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.LVLH);
    }
    return new LofOffset(orekit.eme2000(), LOFType.QSW);
  }

  private Vector3D thrustDirection(PropagationManeuverCommand command) {
    Vector3D raw = new Vector3D(command.directionX(), command.directionY(), command.directionZ());
    return raw.getNorm() == 0.0 ? Vector3D.PLUS_J : raw.normalize();
  }
}
