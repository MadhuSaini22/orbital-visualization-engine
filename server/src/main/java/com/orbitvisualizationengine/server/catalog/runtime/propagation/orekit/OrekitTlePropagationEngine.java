package com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationEngine;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.orekit.frames.FramesFactory;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.PVCoordinates;
import org.springframework.stereotype.Component;

@Component
public class OrekitTlePropagationEngine implements PropagationEngine {
  private static final String OUTPUT_FRAME_NAME = "TEME";

  private final OrekitPropagatorFactory propagatorFactory;

  public OrekitTlePropagationEngine(OrekitPropagatorFactory propagatorFactory) {
    this.propagatorFactory = propagatorFactory;
  }

  @Override
  public List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes) {
    try {
      TLEPropagator propagator = propagatorFactory.createPropagator(satellite.tle());
      List<PropagatedState> states = new ArrayList<>(sampleTimes.size());
      for (Instant sampleTime : sampleTimes) {
        states.add(map(propagator.propagate(toAbsoluteDate(sampleTime))));
      }
      return List.copyOf(states);
    } catch (RuntimeException exception) {
      throw new PropagationException("Unable to propagate runtime satellite", exception);
    }
  }

  private static PropagatedState map(SpacecraftState state) {
    PVCoordinates pv = state.getPVCoordinates(FramesFactory.getTEME());
    return new PropagatedState(
        state.getDate().toDate(TimeScalesFactory.getUTC()).toInstant(),
        OUTPUT_FRAME_NAME,
        vector(pv.getPosition()),
        vector(pv.getVelocity()));
  }

  private static CartesianVector vector(Vector3D vector) {
    return new CartesianVector(vector.getX(), vector.getY(), vector.getZ());
  }

  private static AbsoluteDate toAbsoluteDate(Instant instant) {
    return new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
  }
}
