package com.orbitvisualizationengine.server.propagation;

import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.Frame;
import org.orekit.frames.FramesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;
import org.springframework.stereotype.Component;

@Component
public class OrekitEnvironment {
  public Frame eme2000() {
    return FramesFactory.getEME2000();
  }

  public Frame itrf() {
    return FramesFactory.getITRF(IERSConventions.IERS_2010, true);
  }

  public OneAxisEllipsoid earth() {
    return new OneAxisEllipsoid(
        Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
        Constants.WGS84_EARTH_FLATTENING,
        itrf());
  }
}
