package com.orbitvisualizationengine.server.catalog.runtime.visibility.orekit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationConfiguration;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationPosition;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitTleFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.OrekitTlePropagationEngine;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityWindow;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.orekit.bodies.GeodeticPoint;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.FramesFactory;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;

class OrekitVisibilityEngineTest {
  private final OrekitTleFactory tleFactory = new OrekitTleFactory();
  private final OrekitPropagatorFactory propagatorFactory = new OrekitPropagatorFactory(tleFactory);
  private final OrekitVisibilityEngine engine = new OrekitVisibilityEngine(propagatorFactory);

  @Test
  void computesVisibilityWindowForStationAtInitialSubpoint() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    Instant start = satellite.tle().getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
    Instant stop = start.plus(Duration.ofMinutes(30));
    GroundStation station = stationAtSubpoint(satellite, start);
    VisibilityRequest request = new VisibilityRequest(
        satellite.catalogSatellite().noradCatalogId(),
        station.id(),
        start,
        stop,
        Duration.ofSeconds(60),
        0.0);
    PropagationResult propagationResult = new PropagationService(
        new OrekitTlePropagationEngine(propagatorFactory))
        .propagate(satellite, start, stop, Duration.ofSeconds(60));

    VisibilityResult result = engine.computeVisibility(request, satellite, station, propagationResult);

    assertThat(result.request()).isEqualTo(request);
    assertThat(result.windows()).isNotEmpty();
    VisibilityWindow firstWindow = result.windows().getFirst();
    assertThat(firstWindow.acquisitionOfSignalTime()).isEqualTo(start);
    assertThat(firstWindow.lossOfSignalTime()).isAfter(firstWindow.acquisitionOfSignalTime());
    assertThat(firstWindow.maximumElevationTime())
        .isBetween(firstWindow.acquisitionOfSignalTime(), firstWindow.lossOfSignalTime());
    assertThat(firstWindow.maximumElevationDegrees()).isGreaterThan(0.0);
    assertThat(firstWindow.duration()).isEqualTo(Duration.between(
        firstWindow.acquisitionOfSignalTime(),
        firstWindow.lossOfSignalTime()));
  }

  @Test
  void returnsSingleFullWindowWhenMinimumElevationIsAlwaysSatisfied() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    Instant start = satellite.tle().getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
    Instant stop = start.plus(Duration.ofMinutes(5));
    GroundStation station = new GroundStation(
        new GroundStationId("anywhere"),
        "Anywhere",
        new GroundStationPosition(0.0, 0.0, 0.0),
        GroundStationConfiguration.empty());
    VisibilityRequest request = new VisibilityRequest(
        satellite.catalogSatellite().noradCatalogId(),
        station.id(),
        start,
        stop,
        Duration.ofSeconds(60),
        -90.0);
    PropagationResult propagationResult = new PropagationService(
        new OrekitTlePropagationEngine(propagatorFactory))
        .propagate(satellite, start, stop, Duration.ofSeconds(60));

    VisibilityResult result = engine.computeVisibility(request, satellite, station, propagationResult);

    assertThat(result.windows()).hasSize(1);
    assertThat(result.windows().getFirst().acquisitionOfSignalTime()).isEqualTo(start);
    assertThat(result.windows().getFirst().lossOfSignalTime()).isEqualTo(stop);
  }

  private static GroundStation stationAtSubpoint(RuntimeSatellite satellite, Instant start) {
    AbsoluteDate date = new AbsoluteDate(java.util.Date.from(start), TimeScalesFactory.getUTC());
    TLEPropagator propagator = TLEPropagator.selectExtrapolator(satellite.tle());
    OneAxisEllipsoid earth = new OneAxisEllipsoid(
        Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
        Constants.WGS84_EARTH_FLATTENING,
        FramesFactory.getITRF(IERSConventions.IERS_2010, true));
    GeodeticPoint point = earth.transform(
        propagator.getPVCoordinates(date, FramesFactory.getTEME()).getPosition(),
        FramesFactory.getTEME(),
        date);
    return new GroundStation(
        new GroundStationId("subpoint"),
        "Initial Subpoint",
        new GroundStationPosition(
            Math.toDegrees(point.getLatitude()),
            Math.toDegrees(point.getLongitude()),
            0.0),
        GroundStationConfiguration.empty());
  }
}
