package com.orbitvisualizationengine.server.propagation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceDiagnosticsSample;
import java.io.File;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.junit.jupiter.api.Test;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.data.DataContext;
import org.orekit.data.DataProvidersManager;
import org.orekit.data.DirectoryCrawler;
import org.orekit.forces.ForceModel;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.gravity.potential.NormalizedSphericalHarmonicsProvider;
import org.orekit.frames.EOPHistory;
import org.orekit.frames.FramesFactory;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.IERSConventions;

class OrekitFidelityProofTest {
  private static final String ISS_LINE_1 = "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998";
  private static final String ISS_LINE_2 = "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554";

  @Test
  void printsProofThatExternalOrekitDataIsLoadedAndUsed() {
    DataProvidersManager data = DataContext.getDefault().getDataProvidersManager();
    data.clearProviders();
    data.clearLoadedDataNames();
    File orekitData = new File(orekitDataPath());
    assertTrue(orekitData.isDirectory(), "OREKIT_DATA_PATH must point to an orekit-data directory: " + orekitData);
    data.addProvider(new DirectoryCrawler(orekitData));

    AbsoluteDate start = new TLE(ISS_LINE_1, ISS_LINE_2).getDate();
    Instant startInstant = start.toInstant();
    int degree = 40;
    int order = 40;

    TimeScalesFactory.getUTC();
    EOPHistory eop = FramesFactory.getEOPHistory(IERSConventions.IERS_2010, true);
    NormalizedSphericalHarmonicsProvider gravity = GravityFieldFactory.getNormalizedProvider(degree, order);
    CelestialBodyFactory.getSun().getPosition(start, FramesFactory.getEME2000());
    CelestialBodyFactory.getMoon().getPosition(start, FramesFactory.getEME2000());
    CssiSpaceWeatherData spaceWeather = new CssiSpaceWeatherData(CssiSpaceWeatherData.DEFAULT_SUPPORTED_NAMES);
    double[] ap = spaceWeather.getAp(start);

    Set<String> loadedNames = data.getLoadedDataNames();
    assertLoaded(loadedNames, "EOP", "finals2000A.all");
    assertLoaded(loadedNames, "gravity harmonics", "eigen-6s.gfc");
    assertUtcTaiHistoryLoaded(loadedNames);
    assertLoaded(loadedNames, "planetary ephemerides", "lnxp1990.440");
    assertLoaded(loadedNames, "drag / space weather", "SpaceWeather-All-v1.2.txt");

    OrekitEnvironment environment = new OrekitEnvironment();
    NumericalPropagator numerical = new NumericalPropagator(environment);
    PropagationContext centralContext = context(false);
    PropagationContext fullContext = context(true);

    org.orekit.propagation.numerical.NumericalPropagator central = numerical.buildPropagator(centralContext);
    org.orekit.propagation.numerical.NumericalPropagator full = numerical.buildPropagator(fullContext);
    List<ForceModel> activeForces = full.getAllForceModels();
    assertTrue(activeForces.size() >= 5, "Expected gravity, drag, Sun, Moon, and SRP force models");
    assertFalse(activeForces.stream().map(force -> force.getClass().getSimpleName()).filter("DragForce"::equals).toList().isEmpty(),
        "Expected DragForce to be active");

    AbsoluteDate end = start.shiftedBy(24.0 * 3600.0);
    SpacecraftState centralStart = central.propagate(start);
    SpacecraftState centralEnd = central.propagate(end);
    SpacecraftState fullStart = full.propagate(start);
    SpacecraftState fullEnd = full.propagate(end);

    double centralRaanDrift = raanDegrees(centralEnd) - raanDegrees(centralStart);
    double fullRaanDrift = raanDegrees(fullEnd) - raanDegrees(fullStart);
    double finalDivergenceMeters = positionDivergenceMeters(centralEnd, fullEnd);
    double finalVelocityDivergenceMps = centralEnd.getPVCoordinates().getVelocity()
        .subtract(fullEnd.getPVCoordinates().getVelocity())
        .getNorm();
    ForceDiagnosticsSample diagnostics = numerical.diagnosticsAt(fullContext, startInstant.plusSeconds(3600));

    System.out.println();
    System.out.println("=== OREKIT HIGH-FIDELITY DATA PROOF ===");
    System.out.println("OREKIT_DATA_PATH: " + orekitData.getAbsolutePath());
    System.out.println("Loaded Orekit dataset names:");
    loadedNames.stream().sorted().forEach(name -> System.out.println("  - " + name));
    System.out.println();
    System.out.printf(Locale.ROOT, "EOP data loaded: yes, entries=%d, start=%s, end=%s%n",
        eop.getEntries().size(), eop.getStartDate(), eop.getEndDate());
    System.out.printf(Locale.ROOT, "Gravity harmonics loaded: yes, requested=%dx%d, provider=%dx%d, mu=%.6e, ae=%.3f%n",
        degree, order, gravity.getMaxDegree(), gravity.getMaxOrder(), gravity.getMu(), gravity.getAe());
    System.out.printf(Locale.ROOT, "UTC-TAI history loaded: yes, offsets=%d, lastLeap=%s%n",
        TimeScalesFactory.getUTC().getUTCTAIOffsets().size(), TimeScalesFactory.getUTC().getLastKnownLeapSecond());
    System.out.printf(Locale.ROOT, "Planetary ephemerides loaded: yes, Sun GM=%.6e, Moon GM=%.6e%n",
        CelestialBodyFactory.getSun().getGM(), CelestialBodyFactory.getMoon().getGM());
    System.out.printf(Locale.ROOT, "Drag/space weather loaded: yes, CSSI range=%s to %s, Ap0=%.3f%n",
        spaceWeather.getMinDate(), spaceWeather.getMaxDate(), ap[0]);
    System.out.println();
    System.out.println("Frame configuration:");
    System.out.println("  inertial propagation frame: " + environment.eme2000().getName());
    System.out.println("  Earth-fixed output/gravity frame: " + environment.itrf().getName());
    System.out.println("  IERS conventions: IERS_2010, simpleEOP=true");
    System.out.println();
    System.out.println("Force model activation summary:");
    activeForces.forEach(force -> System.out.println("  - ACTIVE " + force.getClass().getSimpleName()));
    System.out.println();
    System.out.println("Central gravity only vs full Orekit data, 24h from ISS TLE epoch:");
    for (int hour = 0; hour <= 24; hour += 6) {
      AbsoluteDate sample = start.shiftedBy(hour * 3600.0);
      SpacecraftState c = central.propagate(sample);
      SpacecraftState f = full.propagate(sample);
      System.out.printf(Locale.ROOT, "  t+%02dh divergence: position=%.3f m, velocity=%.6f m/s%n",
          hour, positionDivergenceMeters(c, f),
          c.getPVCoordinates().getVelocity().subtract(f.getPVCoordinates().getVelocity()).getNorm());
    }
    System.out.printf(Locale.ROOT, "  final trajectory divergence: position=%.3f m, velocity=%.6f m/s%n",
        finalDivergenceMeters, finalVelocityDivergenceMps);
    System.out.printf(Locale.ROOT, "  central RAAN drift: %.9f deg/day%n", normalizeDegrees(centralRaanDrift));
    System.out.printf(Locale.ROOT, "  full Orekit RAAN drift: %.9f deg/day%n", normalizeDegrees(fullRaanDrift));
    System.out.printf(Locale.ROOT, "  RAAN drift difference: %.9f deg/day%n",
        normalizeDegrees(fullRaanDrift - centralRaanDrift));
    System.out.println();
    System.out.println("Force acceleration magnitudes at t+1h:");
    diagnostics.contributions().forEach(contribution ->
        System.out.printf(Locale.ROOT, "  - %-36s %.12e m/s^2 (%s)%n",
            contribution.name(), contribution.magnitudeMps2(), contribution.frame()));
    System.out.printf(Locale.ROOT, "  total acceleration magnitude: %.12e m/s^2%n",
        diagnostics.totalAccelerationMagnitudeMps2());
    System.out.println("=== END OREKIT HIGH-FIDELITY DATA PROOF ===");

    assertTrue(finalDivergenceMeters > 1.0, "Full force model should diverge measurably from central gravity");
    assertTrue(Math.abs(normalizeDegrees(fullRaanDrift - centralRaanDrift)) > 1.0e-5,
        "Full force model should alter RAAN drift");
  }

  private static PropagationContext context(boolean highFidelity) {
    SatelliteAnalysisConfig config = new SatelliteAnalysisConfig(
        25544,
        highFidelity ? AnalysisPreset.HIGH_FIDELITY : AnalysisPreset.FAST_PREVIEW,
        PropagatorType.NUMERICAL,
        highFidelity,
        highFidelity ? 40 : 2,
        highFidelity ? 40 : 0,
        highFidelity,
        highFidelity,
        highFidelity,
        highFidelity,
        false,
        420.0,
        0.0,
        20.0,
        2.2,
        20.0,
        1.4,
        0.0,
        300.0,
        highFidelity ? "Orekit high-fidelity proof" : "Central gravity proof baseline",
        Instant.now());
    return new PropagationContext(
        25544,
        new TLE(ISS_LINE_1, ISS_LINE_2),
        config,
        SpacecraftModel.fromConfig(config),
        List.of());
  }

  private static void assertLoaded(Set<String> loadedNames, String label, String expected) {
    assertTrue(loadedNames.stream().anyMatch(name -> name.contains(expected)),
        () -> label + " did not load expected Orekit dataset: " + expected + " loaded=" + loadedNames);
  }

  private static void assertUtcTaiHistoryLoaded(Set<String> loadedNames) {
    boolean loadedFromDataset = loadedNames.stream().anyMatch(name -> name.contains("tai-utc.dat"));
    boolean utcOffsetsAvailable = TimeScalesFactory.getUTC().getUTCTAIOffsets().size() >= 40;
    assertTrue(loadedFromDataset || utcOffsetsAvailable,
        () -> "UTC-TAI history did not load tai-utc.dat and UTC offsets are unavailable; loaded=" + loadedNames);
  }

  private static double positionDivergenceMeters(SpacecraftState left, SpacecraftState right) {
    Vector3D delta = left.getPVCoordinates().getPosition().subtract(right.getPVCoordinates().getPosition());
    return delta.getNorm();
  }

  private static double raanDegrees(SpacecraftState state) {
    return Math.toDegrees(new KeplerianOrbit(state.getOrbit()).getRightAscensionOfAscendingNode());
  }

  private static double normalizeDegrees(double degrees) {
    return Math.toDegrees(Math.atan2(Math.sin(Math.toRadians(degrees)), Math.cos(Math.toRadians(degrees))));
  }

  private static String orekitDataPath() {
    String property = System.getProperty("orekit.data.path");
    if (property != null && !property.isBlank()) {
      return property;
    }
    String environment = System.getenv("OREKIT_DATA_PATH");
    return environment == null || environment.isBlank() ? "/Users/madhu/orekit-data" : environment;
  }
}
