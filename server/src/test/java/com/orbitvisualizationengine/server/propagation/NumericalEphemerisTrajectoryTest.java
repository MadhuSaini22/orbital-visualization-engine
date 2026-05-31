package com.orbitvisualizationengine.server.propagation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.utils.Constants;

class NumericalEphemerisTrajectoryTest {
  private static final Instant EPOCH = Instant.parse("2026-05-08T00:00:00Z");

  @Test
  void numericalTrajectoryUsesSingleIntegrationAndMatchesLegacySamples() {
    OrekitTestDataLoader.ensureLoaded();
    OrekitEnvironment environment = new OrekitEnvironment();
    PropagationContext context = context(environment);
    Instant start = EPOCH;
    Instant end = EPOCH.plusSeconds(60 * 60);
    int stepSeconds = 60;
    int expectedSamples = 61;

    CountingNumericalPropagator legacyPropagator = new CountingNumericalPropagator(environment);
    long legacyStartNs = System.nanoTime();
    List<EphemerisState> legacyStates = legacyTrajectory(legacyPropagator, context, start, end, stepSeconds);
    long legacyElapsedNs = System.nanoTime() - legacyStartNs;

    CountingNumericalPropagator ephemerisPropagator = new CountingNumericalPropagator(environment);
    long ephemerisStartNs = System.nanoTime();
    List<EphemerisState> ephemerisStates = ephemerisPropagator.trajectory(context, start, end, stepSeconds);
    long ephemerisElapsedNs = System.nanoTime() - ephemerisStartNs;

    assertEquals(expectedSamples, legacyStates.size());
    assertEquals(expectedSamples, legacyPropagator.buildCount.get());
    assertEquals(1, ephemerisPropagator.buildCount.get());
    assertEquals(legacyStates.size(), ephemerisStates.size());

    double maxPositionDeltaMeters = maxPositionDeltaMeters(legacyStates, ephemerisStates);
    assertTrue(maxPositionDeltaMeters < 15.0,
        "Generated ephemeris samples drifted " + maxPositionDeltaMeters + " meters from legacy samples.");

    System.out.printf(
        "Numerical trajectory benchmark: legacy sample-loop builds=%d elapsed=%.1f ms; ephemeris builds=%d elapsed=%.1f ms; maxDelta=%.3f m%n",
        legacyPropagator.buildCount.get(),
        legacyElapsedNs / 1_000_000.0,
        ephemerisPropagator.buildCount.get(),
        ephemerisElapsedNs / 1_000_000.0,
        maxPositionDeltaMeters);
  }

  private static List<EphemerisState> legacyTrajectory(
      NumericalPropagator propagator,
      PropagationContext context,
      Instant start,
      Instant end,
      int stepSeconds) {
    List<EphemerisState> states = new ArrayList<>();
    for (Instant cursor = start; !cursor.isAfter(end); cursor = cursor.plusSeconds(stepSeconds)) {
      states.add(propagator.propagate(context, cursor));
    }
    return states;
  }

  private static double maxPositionDeltaMeters(List<EphemerisState> expected, List<EphemerisState> actual) {
    double maxDeltaKm = 0.0;
    for (int index = 0; index < expected.size(); index += 1) {
      assertEquals(expected.get(index).time(), actual.get(index).time());
      maxDeltaKm = Math.max(maxDeltaKm, positionDeltaKm(expected.get(index), actual.get(index)));
    }
    return maxDeltaKm * 1000.0;
  }

  private static double positionDeltaKm(EphemerisState first, EphemerisState second) {
    double[] a = first.positionKm();
    double[] b = second.positionKm();
    double dx = a[0] - b[0];
    double dy = a[1] - b[1];
    double dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private static PropagationContext context(OrekitEnvironment environment) {
    Orbit initialOrbit = new KeplerianOrbit(
        7000.0e3,
        0.001,
        Math.toRadians(51.6),
        0.0,
        0.0,
        0.0,
        PositionAngleType.TRUE,
        environment.eme2000(),
        OrekitStateMapper.toAbsoluteDate(EPOCH),
        Constants.EGM96_EARTH_MU);
    SatelliteAnalysisConfig config = new SatelliteAnalysisConfig(
        999,
        AnalysisPreset.FAST_PREVIEW,
        PropagatorType.NUMERICAL,
        false,
        2,
        0,
        false,
        false,
        false,
        false,
        false,
        850.0,
        150.0,
        20.0,
        2.2,
        15.0,
        1.2,
        0.2,
        220.0,
        "Ephemeris trajectory regression test.",
        EPOCH);

    return new PropagationContext(
        999,
        new OrbitSeed(OrbitDefinitionType.CLASSICAL_ELEMENTS, EPOCH, "EME2000", "EARTH", null, initialOrbit),
        config,
        SpacecraftModel.fromConfig(config),
        List.of());
  }

  private static class CountingNumericalPropagator extends NumericalPropagator {
    private final AtomicInteger buildCount = new AtomicInteger();

    CountingNumericalPropagator(OrekitEnvironment orekit) {
      super(orekit);
    }

    @Override
    public org.orekit.propagation.numerical.NumericalPropagator buildPropagator(PropagationContext context) {
      buildCount.incrementAndGet();
      return super.buildPropagator(context);
    }
  }
}
