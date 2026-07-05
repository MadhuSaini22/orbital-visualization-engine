package com.orbitvisualizationengine.server.catalog.runtime.eclipse.orekit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseInterval;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseRequest;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseResult;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseType;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitPropagatorFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.OrekitTleFactory;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.orekit.OrekitTlePropagationEngine;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.orekit.time.TimeScalesFactory;

class OrekitEclipseEngineTest {
  private final OrekitTleFactory tleFactory = new OrekitTleFactory();
  private final OrekitPropagatorFactory propagatorFactory = new OrekitPropagatorFactory(tleFactory);
  private final OrekitEclipseEngine engine = new OrekitEclipseEngine(propagatorFactory);

  @Test
  void computesSunlightPenumbraAndUmbraIntervalsOverMultipleOrbits() {
    assumeTrue(OrekitTestDataLoader.ensureLoaded(), "Solar ephemerides required — set OREKIT_DATA_PATH");
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    Instant start = satellite.tle().getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
    Instant stop = start.plus(Duration.ofHours(4));
    EclipseRequest request = new EclipseRequest(
        satellite.catalogSatellite().noradCatalogId(),
        start,
        stop,
        Duration.ofMinutes(2));
    PropagationResult propagationResult = new PropagationService(
        new OrekitTlePropagationEngine(propagatorFactory))
        .propagate(satellite, start, stop, request.step());

    EclipseResult result = engine.computeEclipses(request, propagationResult);

    assertThat(result.request()).isEqualTo(request);
    assertThat(result.intervals()).isNotEmpty();
    assertThat(result.intervals().getFirst().startTime()).isEqualTo(start);
    assertThat(result.intervals().getLast().stopTime()).isEqualTo(stop);
    assertThat(result.intervals()).allSatisfy(interval -> {
      assertThat(interval.duration()).isEqualTo(Duration.between(interval.startTime(), interval.stopTime()));
      assertThat(interval.stopTime()).isAfterOrEqualTo(interval.startTime());
    });
    assertThat(result.intervals())
        .extracting(EclipseInterval::type)
        .contains(EclipseType.SUNLIGHT, EclipseType.UMBRA);
  }

  @Test
  void returnsOneClassifiedIntervalForInstantaneousRequest() {
    assumeTrue(OrekitTestDataLoader.ensureLoaded(), "Solar ephemerides required — set OREKIT_DATA_PATH");
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    Instant timestamp = satellite.tle().getDate().toDate(TimeScalesFactory.getUTC()).toInstant();
    EclipseRequest request = new EclipseRequest(
        satellite.catalogSatellite().noradCatalogId(),
        timestamp,
        timestamp,
        Duration.ofMinutes(1));
    PropagationResult propagationResult = new PropagationService(
        new OrekitTlePropagationEngine(propagatorFactory))
        .propagate(satellite, timestamp, timestamp, request.step());

    EclipseResult result = engine.computeEclipses(request, propagationResult);

    assertThat(result.intervals()).hasSize(1);
    assertThat(result.intervals().getFirst().startTime()).isEqualTo(timestamp);
    assertThat(result.intervals().getFirst().stopTime()).isEqualTo(timestamp);
    assertThat(result.intervals().getFirst().duration()).isZero();
  }
}
