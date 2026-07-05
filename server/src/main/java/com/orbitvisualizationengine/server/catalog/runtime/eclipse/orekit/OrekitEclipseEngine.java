package com.orbitvisualizationengine.server.catalog.runtime.eclipse.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseEngine;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseException;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseInterval;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseRequest;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseResult;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseType;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import org.hipparchus.ode.events.Action;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.FramesFactory;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.propagation.events.EclipseDetector;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;
import org.springframework.stereotype.Component;

@Component
public class OrekitEclipseEngine implements EclipseEngine {
  private final OrekitPropagatorFactory propagatorFactory;

  public OrekitEclipseEngine(OrekitPropagatorFactory propagatorFactory) {
    this.propagatorFactory = propagatorFactory;
  }

  @Override
  public EclipseResult computeEclipses(EclipseRequest request, PropagationResult propagationResult) {
    try {
      TLEPropagator eventPropagator = propagatorFactory.createPropagator(
          propagationResult.satellite().tle());
      OneAxisEllipsoid earth = earth();
      EclipseDetector penumbraDetector = eclipseDetector(earth).withPenumbra();
      EclipseDetector umbraDetector = eclipseDetector(earth).withUmbra();

      TreeSet<Instant> boundaries = collectBoundaries(
          eventPropagator,
          request.startTime(),
          request.stopTime(),
          penumbraDetector,
          umbraDetector);

      TLEPropagator classificationPropagator = propagatorFactory.createPropagator(
          propagationResult.satellite().tle());
      List<EclipseInterval> intervals = classifyIntervals(
          request,
          boundaries,
          classificationPropagator,
          penumbraDetector,
          umbraDetector);
      return new EclipseResult(request, intervals);
    } catch (EclipseException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw new EclipseException("Unable to compute eclipse intervals", exception);
    }
  }

  private static TreeSet<Instant> collectBoundaries(
      TLEPropagator propagator,
      Instant startTime,
      Instant stopTime,
      EclipseDetector penumbraDetector,
      EclipseDetector umbraDetector) {
    TreeSet<Instant> boundaries = new TreeSet<>();
    boundaries.add(startTime);
    boundaries.add(stopTime);

    propagator.addEventDetector(penumbraDetector.withHandler((state, detector, increasing) -> {
      boundaries.add(toInstant(state));
      return Action.CONTINUE;
    }));
    propagator.addEventDetector(umbraDetector.withHandler((state, detector, increasing) -> {
      boundaries.add(toInstant(state));
      return Action.CONTINUE;
    }));
    propagator.propagate(toAbsoluteDate(startTime), toAbsoluteDate(stopTime));
    return boundaries;
  }

  private static List<EclipseInterval> classifyIntervals(
      EclipseRequest request,
      TreeSet<Instant> boundaries,
      TLEPropagator propagator,
      EclipseDetector penumbraDetector,
      EclipseDetector umbraDetector) {
    if (request.startTime().equals(request.stopTime())) {
      return List.of(interval(
          classify(propagator, penumbraDetector, umbraDetector, request.startTime()),
          request.startTime(),
          request.stopTime()));
    }

    List<EclipseInterval> intervals = new ArrayList<>();
    Instant previous = null;
    for (Instant boundary : boundaries) {
      if (previous != null && boundary.isAfter(previous)) {
        Instant classificationTime = midpoint(previous, boundary);
        EclipseType type = classify(propagator, penumbraDetector, umbraDetector, classificationTime);
        addMerged(intervals, interval(type, previous, boundary));
      }
      previous = boundary;
    }
    return List.copyOf(intervals);
  }

  private static EclipseInterval interval(EclipseType type, Instant startTime, Instant stopTime) {
    return new EclipseInterval(type, startTime, stopTime, Duration.between(startTime, stopTime));
  }

  private static void addMerged(List<EclipseInterval> intervals, EclipseInterval next) {
    if (intervals.isEmpty()) {
      intervals.add(next);
      return;
    }

    EclipseInterval previous = intervals.getLast();
    if (previous.type() == next.type() && previous.stopTime().equals(next.startTime())) {
      intervals.set(
          intervals.size() - 1,
          interval(previous.type(), previous.startTime(), next.stopTime()));
    } else {
      intervals.add(next);
    }
  }

  private static EclipseType classify(
      TLEPropagator propagator,
      EclipseDetector penumbraDetector,
      EclipseDetector umbraDetector,
      Instant timestamp) {
    SpacecraftState state = propagator.propagate(toAbsoluteDate(timestamp));
    if (umbraDetector.g(state) < 0.0) {
      return EclipseType.UMBRA;
    }
    if (penumbraDetector.g(state) < 0.0) {
      return EclipseType.PENUMBRA;
    }
    return EclipseType.SUNLIGHT;
  }

  private static Instant midpoint(Instant startTime, Instant stopTime) {
    return startTime.plus(Duration.between(startTime, stopTime).dividedBy(2));
  }

  private static EclipseDetector eclipseDetector(OneAxisEllipsoid earth) {
    return new EclipseDetector(CelestialBodyFactory.getSun(), Constants.SUN_RADIUS, earth);
  }

  private static OneAxisEllipsoid earth() {
    return new OneAxisEllipsoid(
        Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
        Constants.WGS84_EARTH_FLATTENING,
        FramesFactory.getITRF(IERSConventions.IERS_2010, true));
  }

  private static AbsoluteDate toAbsoluteDate(Instant instant) {
    return new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
  }

  private static Instant toInstant(SpacecraftState state) {
    return state.getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
  }
}
