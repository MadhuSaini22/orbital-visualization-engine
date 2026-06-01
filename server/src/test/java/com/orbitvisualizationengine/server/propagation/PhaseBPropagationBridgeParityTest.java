package com.orbitvisualizationengine.server.propagation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.ManeuverStatus;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.service.MissionTimelineValidator;
import com.orbitvisualizationengine.server.service.TimelineExecutor;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.orekit.forces.ForceModel;
import org.orekit.forces.maneuvers.ConstantThrustManeuver;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.utils.Constants;

class PhaseBPropagationBridgeParityTest {
  private static final Instant EPOCH = Instant.parse("2026-05-08T00:00:00Z");
  private static final Instant BURN_TIME = EPOCH.plusSeconds(600);
  private static final double THRUST_N = 1.4;
  private static final double ISP_S = 300.0;
  private static final double DURATION_S = 120.0;

  @Test
  void timelineFiniteBurnCommandMatchesLegacyManeuverCommand() {
    SpacecraftModel spacecraft = SpacecraftModel.fromConfig(config());
    ManeuverEvent legacy = legacyManeuver();
    MissionTimelineEvent timeline = timelineEvent(TimelineEventType.FINITE_BURN, true);

    PropagationManeuverCommand legacyCommand =
        new LegacyManeuverCommandAdapter().fromLegacy(legacy, spacecraft);
    PropagationManeuverCommand timelineCommand =
        new TimelineExecutor(new MissionTimelineValidator()).toPropagationCommands(List.of(timeline)).getFirst();

    assertEquivalentCommand(legacyCommand, timelineCommand);
  }

  @Test
  void unsupportedTimelineManeuverTypesFailExplicitly() {
    TimelineExecutor executor = new TimelineExecutor(new MissionTimelineValidator());

    IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
        () -> executor.toPropagationCommands(List.of(timelineEvent(TimelineEventType.HOHMANN_TRANSFER, true))));

    assertTrue(exception.getMessage().contains("HOHMANN_TRANSFER is not supported by Phase B propagation bridge"));
  }

  @Test
  void disabledTimelineEventsDoNotGenerateCommands() {
    TimelineExecutor executor = new TimelineExecutor(new MissionTimelineValidator());

    assertEquals(List.of(), executor.toPropagationCommands(List.of(timelineEvent(TimelineEventType.FINITE_BURN, false))));
  }

  @Test
  void coastTimelineEventsArePropagationNoOps() {
    TimelineExecutor executor = new TimelineExecutor(new MissionTimelineValidator());

    assertEquals(List.of(), executor.toPropagationCommands(List.of(timelineEvent(TimelineEventType.COAST, true))));
  }

  @Test
  void legacyAndTimelinePathsGenerateEquivalentForceModelsAndTrajectories() {
    OrekitTestDataLoader.ensureLoaded();
    OrekitEnvironment environment = new OrekitEnvironment();
    NumericalPropagator propagator = new NumericalPropagator(environment);
    PropagationContext legacyContext = context(environment, List.of(legacyManeuver()), List.of());
    PropagationManeuverCommand timelineCommand =
        new TimelineExecutor(new MissionTimelineValidator()).toPropagationCommands(List.of(timelineEvent(TimelineEventType.FINITE_BURN, true))).getFirst();
    PropagationContext timelineContext = context(environment, List.of(), List.of(timelineCommand));

    List<ForceModel> legacyForces = propagator.forceModels(legacyContext);
    List<ForceModel> timelineForces = propagator.forceModels(timelineContext);

    assertEquals(countConstantThrust(legacyForces), countConstantThrust(timelineForces));
    assertEquals(1, countConstantThrust(timelineForces));

    Instant start = EPOCH;
    Instant end = EPOCH.plusSeconds(1800);
    List<EphemerisState> legacyStates = propagator.trajectory(legacyContext, start, end, 60);
    List<EphemerisState> timelineStates = propagator.trajectory(timelineContext, start, end, 60);

    double maxPositionDeltaMeters = maxPositionDeltaMeters(legacyStates, timelineStates);
    double maxVelocityDeltaMillimetersPerSecond = maxVelocityDeltaMillimetersPerSecond(legacyStates, timelineStates);

    System.out.printf(
        "Phase B bridge parity: maxPositionDelta=%.9f m maxVelocityDelta=%.12f mm/s%n",
        maxPositionDeltaMeters,
        maxVelocityDeltaMillimetersPerSecond);

    assertTrue(maxPositionDeltaMeters < 0.001,
        "Position delta must be < 1 mm, actual meters=" + maxPositionDeltaMeters);
    assertTrue(maxVelocityDeltaMillimetersPerSecond < 0.001,
        "Velocity delta must be < 0.001 mm/s, actual mm/s=" + maxVelocityDeltaMillimetersPerSecond);
  }

  private static int countConstantThrust(List<ForceModel> models) {
    return (int) models.stream()
        .filter(model -> model instanceof ConstantThrustManeuver)
        .count();
  }

  private static void assertEquivalentCommand(PropagationManeuverCommand legacy, PropagationManeuverCommand timeline) {
    assertEquals(PropagationManeuverType.FINITE_BURN, legacy.maneuverType());
    assertEquals(legacy.maneuverType(), timeline.maneuverType());
    assertEquals(legacy.executionTimeUtc(), timeline.executionTimeUtc());
    assertEquals(legacy.durationSeconds(), timeline.durationSeconds(), 0.0);
    assertEquals(legacy.thrustNewton(), timeline.thrustNewton(), 0.0);
    assertEquals(legacy.ispSeconds(), timeline.ispSeconds(), 0.0);
    assertEquals(legacy.directionFrame(), timeline.directionFrame());
    assertEquals(legacy.directionX(), timeline.directionX(), 0.0);
    assertEquals(legacy.directionY(), timeline.directionY(), 0.0);
    assertEquals(legacy.directionZ(), timeline.directionZ(), 0.0);
    assertEquals(legacy.metadata().get("source"), timeline.metadata().get("source"));
  }

  private static double maxPositionDeltaMeters(List<EphemerisState> expected, List<EphemerisState> actual) {
    double maxDeltaKm = 0.0;
    for (int index = 0; index < expected.size(); index++) {
      assertEquals(expected.get(index).time(), actual.get(index).time());
      double[] a = expected.get(index).positionKm();
      double[] b = actual.get(index).positionKm();
      double dx = a[0] - b[0];
      double dy = a[1] - b[1];
      double dz = a[2] - b[2];
      maxDeltaKm = Math.max(maxDeltaKm, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return maxDeltaKm * 1000.0;
  }

  private static double maxVelocityDeltaMillimetersPerSecond(List<EphemerisState> expected, List<EphemerisState> actual) {
    double maxDeltaKmps = 0.0;
    for (int index = 0; index < expected.size(); index++) {
      double[] a = expected.get(index).velocityKmps();
      double[] b = actual.get(index).velocityKmps();
      double dx = a[0] - b[0];
      double dy = a[1] - b[1];
      double dz = a[2] - b[2];
      maxDeltaKmps = Math.max(maxDeltaKmps, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return maxDeltaKmps * 1_000_000.0;
  }

  private static ManeuverEvent legacyManeuver() {
    return new ManeuverEvent(
        "finite-burn-1",
        999,
        "Finite burn parity",
        ManeuverStatus.PLANNED,
        BURN_TIME,
        0.0,
        (int) DURATION_S,
        "TNW",
        Map.of("x", 1.0, "y", 0.0, "z", 0.0),
        Map.of("thrustN", THRUST_N, "ispS", ISP_S, "source", "phase-b-parity"));
  }

  private static MissionTimelineEvent timelineEvent(TimelineEventType type, boolean enabled) {
    return new MissionTimelineEvent(
        "finite-burn-1",
        "mission-1",
        0,
        type,
        "Finite burn parity",
        enabled,
        BURN_TIME,
        Map.of(
            "durationSeconds", DURATION_S,
            "thrustNewton", THRUST_N,
            "ispSeconds", ISP_S,
            "directionFrame", "TNW",
            "directionX", 1.0,
            "directionY", 0.0,
            "directionZ", 0.0,
            "source", "phase-b-parity"),
        EPOCH,
        EPOCH);
  }

  private static PropagationContext context(
      OrekitEnvironment environment,
      List<ManeuverEvent> maneuvers,
      List<PropagationManeuverCommand> commands) {
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
    SatelliteAnalysisConfig config = config();

    return new PropagationContext(
        999,
        new OrbitSeed(OrbitDefinitionType.CLASSICAL_ELEMENTS, EPOCH, "EME2000", "EARTH", null, initialOrbit),
        config,
        SpacecraftModel.fromConfig(config),
        maneuvers,
        commands);
  }

  private static SatelliteAnalysisConfig config() {
    return new SatelliteAnalysisConfig(
        999,
        AnalysisPreset.MANEUVER_PLANNING,
        PropagatorType.NUMERICAL,
        false,
        2,
        0,
        false,
        false,
        false,
        false,
        true,
        850.0,
        150.0,
        20.0,
        2.2,
        15.0,
        1.2,
        0.2,
        220.0,
        "Phase B parity test.",
        EPOCH);
  }
}
