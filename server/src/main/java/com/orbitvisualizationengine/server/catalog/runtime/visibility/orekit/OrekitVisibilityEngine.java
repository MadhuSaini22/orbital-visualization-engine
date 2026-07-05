package com.orbitvisualizationengine.server.catalog.runtime.visibility.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityEngine;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityException;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityWindow;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;
import org.hipparchus.ode.events.Action;
import org.orekit.bodies.GeodeticPoint;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.FramesFactory;
import org.orekit.frames.TopocentricFrame;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.propagation.events.ElevationDetector;
import org.orekit.propagation.events.EventDetector;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;
import org.springframework.stereotype.Component;

@Component
public class OrekitVisibilityEngine implements VisibilityEngine {
  private final OrekitPropagatorFactory propagatorFactory;

  public OrekitVisibilityEngine(OrekitPropagatorFactory propagatorFactory) {
    this.propagatorFactory = propagatorFactory;
  }

  @Override
  public VisibilityResult computeVisibility(
      VisibilityRequest request,
      RuntimeSatellite satellite,
      GroundStation groundStation,
      PropagationResult propagationResult) {
    try {
      TopocentricFrame stationFrame = topocentricFrame(groundStation);
      TLEPropagator eventPropagator = propagatorFactory.createPropagator(satellite.tle());
      double minimumElevationRadians = Math.toRadians(request.minimumElevationDegrees());
      List<ElevationEvent> events = collectElevationEvents(
          eventPropagator,
          stationFrame,
          request.startTime(),
          request.stopTime(),
          minimumElevationRadians);

      TLEPropagator elevationPropagator = propagatorFactory.createPropagator(satellite.tle());
      List<VisibilityWindow> windows = buildWindows(
          events,
          request,
          propagationResult,
          elevationPropagator,
          stationFrame,
          minimumElevationRadians);
      return new VisibilityResult(request, windows);
    } catch (VisibilityException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw new VisibilityException("Unable to compute ground station visibility", exception);
    }
  }

  private static List<ElevationEvent> collectElevationEvents(
      TLEPropagator propagator,
      TopocentricFrame stationFrame,
      Instant startTime,
      Instant stopTime,
      double minimumElevationRadians) {
    List<ElevationEvent> events = new ArrayList<>();
    EventDetector detector = new ElevationDetector(stationFrame)
        .withConstantElevation(minimumElevationRadians)
        .withHandler((state, eventDetector, increasing) -> {
          events.add(new ElevationEvent(toInstant(state), increasing));
          return Action.CONTINUE;
        });
    propagator.addEventDetector(detector);
    propagator.propagate(toAbsoluteDate(startTime), toAbsoluteDate(stopTime));
    return events.stream()
        .sorted(Comparator.comparing(ElevationEvent::timestamp))
        .toList();
  }

  private static List<VisibilityWindow> buildWindows(
      List<ElevationEvent> events,
      VisibilityRequest request,
      PropagationResult propagationResult,
      TLEPropagator propagator,
      TopocentricFrame stationFrame,
      double minimumElevationRadians) {
    List<VisibilityWindow> windows = new ArrayList<>();
    Instant currentAos = isVisible(propagator, stationFrame, request.startTime(), minimumElevationRadians)
        ? request.startTime()
        : null;

    for (ElevationEvent event : events) {
      if (event.acquisitionOfSignal()) {
        if (currentAos == null) {
          currentAos = event.timestamp();
        }
      } else if (currentAos != null) {
        windows.add(window(currentAos, event.timestamp(), propagationResult, propagator, stationFrame));
        currentAos = null;
      }
    }

    if (currentAos != null) {
      windows.add(window(currentAos, request.stopTime(), propagationResult, propagator, stationFrame));
    }

    return List.copyOf(windows);
  }

  private static VisibilityWindow window(
      Instant aos,
      Instant los,
      PropagationResult propagationResult,
      TLEPropagator propagator,
      TopocentricFrame stationFrame) {
    MaximumElevation maximumElevation = maximumElevation(aos, los, propagationResult, propagator, stationFrame);
    return new VisibilityWindow(
        aos,
        los,
        maximumElevation.timestamp(),
        maximumElevation.elevationDegrees(),
        Duration.between(aos, los));
  }

  private static MaximumElevation maximumElevation(
      Instant aos,
      Instant los,
      PropagationResult propagationResult,
      TLEPropagator propagator,
      TopocentricFrame stationFrame) {
    TreeSet<Instant> candidates = new TreeSet<>();
    candidates.add(aos);
    candidates.add(los);
    propagationResult.states().stream()
        .map(PropagatedState::timestamp)
        .filter(timestamp -> !timestamp.isBefore(aos) && !timestamp.isAfter(los))
        .forEach(candidates::add);

    Instant maxTime = aos;
    double maxElevation = Double.NEGATIVE_INFINITY;
    for (Instant candidate : candidates) {
      double elevation = elevationRadians(propagator, stationFrame, candidate);
      if (elevation > maxElevation) {
        maxElevation = elevation;
        maxTime = candidate;
      }
    }
    return new MaximumElevation(maxTime, Math.toDegrees(maxElevation));
  }

  private static boolean isVisible(
      TLEPropagator propagator,
      TopocentricFrame stationFrame,
      Instant timestamp,
      double minimumElevationRadians) {
    return elevationRadians(propagator, stationFrame, timestamp) >= minimumElevationRadians;
  }

  private static double elevationRadians(
      TLEPropagator propagator,
      TopocentricFrame stationFrame,
      Instant timestamp) {
    AbsoluteDate date = toAbsoluteDate(timestamp);
    return stationFrame.getElevation(
        propagator.getPVCoordinates(date, FramesFactory.getTEME()).getPosition(),
        FramesFactory.getTEME(),
        date);
  }

  private static TopocentricFrame topocentricFrame(GroundStation groundStation) {
    OneAxisEllipsoid earth = new OneAxisEllipsoid(
        Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
        Constants.WGS84_EARTH_FLATTENING,
        FramesFactory.getITRF(IERSConventions.IERS_2010, true));
    GeodeticPoint point = new GeodeticPoint(
        Math.toRadians(groundStation.position().latitudeDegrees()),
        Math.toRadians(groundStation.position().longitudeDegrees()),
        groundStation.position().altitudeMeters());
    return new TopocentricFrame(earth, point, groundStation.name());
  }

  private static AbsoluteDate toAbsoluteDate(Instant instant) {
    return new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
  }

  private static Instant toInstant(SpacecraftState state) {
    return state.getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
  }

  private record ElevationEvent(Instant timestamp, boolean acquisitionOfSignal) {
  }

  private record MaximumElevation(Instant timestamp, double elevationDegrees) {
  }
}
