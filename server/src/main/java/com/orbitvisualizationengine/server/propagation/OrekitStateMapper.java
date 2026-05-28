package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Instant;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.orekit.bodies.GeodeticPoint;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.Frame;
import org.orekit.propagation.Propagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.PVCoordinates;

public final class OrekitStateMapper {
  private OrekitStateMapper() {
  }

  public static AbsoluteDate toAbsoluteDate(Instant instant) {
    return new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
  }

  public static EphemerisState propagateToState(
      Propagator propagator,
      Instant instant,
      Frame outputFrame,
      OneAxisEllipsoid earth,
      String frameName) {
    AbsoluteDate date = toAbsoluteDate(instant);
    PVCoordinates fixedPv = propagator.getPVCoordinates(date, outputFrame);
    Vector3D position = fixedPv.getPosition();
    Vector3D velocity = fixedPv.getVelocity();
    GeodeticPoint point = earth.transform(position, outputFrame, date);

    return new EphemerisState(
        instant,
        frameName,
        new double[] {position.getX() / 1000.0, position.getY() / 1000.0, position.getZ() / 1000.0},
        new double[] {velocity.getX() / 1000.0, velocity.getY() / 1000.0, velocity.getZ() / 1000.0},
        Math.toDegrees(point.getLatitude()),
        Math.toDegrees(point.getLongitude()),
        point.getAltitude() / 1000.0);
  }
}
