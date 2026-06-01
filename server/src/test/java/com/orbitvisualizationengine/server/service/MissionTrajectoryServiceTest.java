package com.orbitvisualizationengine.server.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.ManeuverStatus;
import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.dto.MissionTrajectoryRequest;
import com.orbitvisualizationengine.server.propagation.NumericalPropagator;
import com.orbitvisualizationengine.server.propagation.OrbitSeed;
import com.orbitvisualizationengine.server.propagation.OrekitEnvironment;
import com.orbitvisualizationengine.server.propagation.OrekitStateMapper;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverCommand;
import com.orbitvisualizationengine.server.propagation.SpacecraftModel;
import com.orbitvisualizationengine.server.repository.MissionRepository;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.junit.jupiter.api.Test;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;

class MissionTrajectoryServiceTest {
  private static final int NORAD_ID = 999;
  private static final String MISSION_ID = "mission-trajectory-parity";
  private static final Instant EPOCH = Instant.parse("2026-05-08T00:00:00Z");
  private static final Instant BURN_TIME = EPOCH.plusSeconds(600);
  private static final double THRUST_N = 1.4;
  private static final double ISP_S = 300.0;
  private static final double DURATION_S = 120.0;

  @Test
  void missionTimelineTrajectoryMatchesLegacyManeuverTrajectory() {
    OrekitTestDataLoader.ensureLoaded();
    OrekitEnvironment environment = new OrekitEnvironment();
    NumericalPropagator numericalPropagator = new NumericalPropagator(environment);
    SatelliteAnalysisConfig config = config();
    PropagationContext baseContext = context(environment, List.of(), List.of(), config);
    PropagationContext legacyContext = context(environment, List.of(legacyManeuver()), List.of(), config);
    PropagationManeuverCommand timelineCommand =
        new TimelineExecutor(new MissionTimelineValidator()).toPropagationCommands(List.of(timelineEvent())).getFirst();

    MissionService missions = missionService(mission());
    MissionTimelinePropagationService timelinePropagation =
        new FixedTimelinePropagationService(List.of(timelineCommand));
    MissionTrajectoryService service =
        new MissionTrajectoryService(missions, timelinePropagation, noradId -> baseContext, numericalPropagator);

    MissionTrajectoryRequest request = new MissionTrajectoryRequest(
        MISSION_ID,
        EPOCH,
        EPOCH.plusSeconds(1800),
        60);
    List<EphemerisState> legacyStates =
        numericalPropagator.trajectory(legacyContext, request.startTime(), request.endTime(), request.stepSeconds());
    List<EphemerisState> missionStates = service.trajectory(MISSION_ID, request);

    double maxPositionDeltaMeters = maxPositionDeltaMeters(legacyStates, missionStates);
    double maxVelocityDeltaMillimetersPerSecond = maxVelocityDeltaMillimetersPerSecond(legacyStates, missionStates);
    OrbitalElementDelta elementDelta = orbitalElementDelta(environment, legacyStates.getLast(), missionStates.getLast());

    System.out.printf(
        "Phase C mission parity: maxPositionDelta=%.9f m maxVelocityDelta=%.12f mm/s "
            + "smaDelta=%.12f m eccDelta=%.12e incDelta=%.12e rad%n",
        maxPositionDeltaMeters,
        maxVelocityDeltaMillimetersPerSecond,
        elementDelta.smaMeters(),
        elementDelta.eccentricity(),
        elementDelta.inclinationRadians());

    assertTrue(maxPositionDeltaMeters < 0.001,
        "Position delta must be < 1 mm, actual meters=" + maxPositionDeltaMeters);
    assertTrue(maxVelocityDeltaMillimetersPerSecond < 0.001,
        "Velocity delta must be < 0.001 mm/s, actual mm/s=" + maxVelocityDeltaMillimetersPerSecond);
    assertEquals(0.0, elementDelta.smaMeters(), 1.0e-9);
    assertEquals(0.0, elementDelta.eccentricity(), 1.0e-12);
    assertEquals(0.0, elementDelta.inclinationRadians(), 1.0e-12);
  }

  @Test
  void missionTrajectoryRequiresMatchingMissionId() {
    MissionTrajectoryService service = new MissionTrajectoryService(
        missionService(mission()),
        new FixedTimelinePropagationService(List.of()),
        noradId -> context(new OrekitEnvironment(), List.of(), List.of(), config()),
        new NumericalPropagator(new OrekitEnvironment()));

    IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, () ->
        service.trajectory("mission-a", new MissionTrajectoryRequest(
            "mission-b",
            EPOCH,
            EPOCH.plusSeconds(60),
            60)));

    assertEquals("Request missionId must match path missionId.", exception.getMessage());
  }

  @Test
  void missionTrajectoryRequiresMissionSubject() {
    MissionService missions = missionService(new Mission(
        MISSION_ID,
        "No subject",
        null,
        PropagatorType.NUMERICAL,
        EPOCH,
        EPOCH.plusSeconds(3600),
        EPOCH,
        EPOCH));
    MissionTrajectoryService service = new MissionTrajectoryService(
        missions,
        new FixedTimelinePropagationService(List.of()),
        noradId -> context(new OrekitEnvironment(), List.of(), List.of(), config()),
        new NumericalPropagator(new OrekitEnvironment()));

    IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, () ->
        service.trajectory(MISSION_ID, new MissionTrajectoryRequest(
            MISSION_ID,
            EPOCH,
            EPOCH.plusSeconds(60),
            60)));

    assertEquals("Mission trajectory requires subjectNoradId: " + MISSION_ID, exception.getMessage());
  }

  private static Mission mission() {
    return new Mission(
        MISSION_ID,
        "Mission trajectory parity",
        NORAD_ID,
        PropagatorType.NUMERICAL,
        EPOCH,
        EPOCH.plusSeconds(3600),
        EPOCH,
        EPOCH);
  }

  private static MissionService missionService(Mission mission) {
    InMemoryMissionRepository repository = new InMemoryMissionRepository();
    repository.save(mission);
    return new MissionService(repository, new MissionTimelineValidator());
  }

  private static ManeuverEvent legacyManeuver() {
    return new ManeuverEvent(
        "finite-burn-1",
        NORAD_ID,
        "Finite burn parity",
        ManeuverStatus.PLANNED,
        BURN_TIME,
        0.0,
        (int) DURATION_S,
        "TNW",
        Map.of("x", 1.0, "y", 0.0, "z", 0.0),
        Map.of("thrustN", THRUST_N, "ispS", ISP_S, "source", "phase-c-parity"));
  }

  private static MissionTimelineEvent timelineEvent() {
    return new MissionTimelineEvent(
        "finite-burn-1",
        MISSION_ID,
        0,
        TimelineEventType.FINITE_BURN,
        "Finite burn parity",
        true,
        BURN_TIME,
        Map.of(
            "durationSeconds", DURATION_S,
            "thrustNewton", THRUST_N,
            "ispSeconds", ISP_S,
            "directionFrame", "TNW",
            "directionX", 1.0,
            "directionY", 0.0,
            "directionZ", 0.0,
            "source", "phase-c-parity"),
        EPOCH,
        EPOCH);
  }

  private static PropagationContext context(
      OrekitEnvironment environment,
      List<ManeuverEvent> maneuvers,
      List<PropagationManeuverCommand> commands,
      SatelliteAnalysisConfig config) {
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

    return new PropagationContext(
        NORAD_ID,
        new OrbitSeed(OrbitDefinitionType.CLASSICAL_ELEMENTS, EPOCH, "EME2000", "EARTH", null, initialOrbit),
        config,
        SpacecraftModel.fromConfig(config),
        maneuvers,
        commands);
  }

  private static SatelliteAnalysisConfig config() {
    return new SatelliteAnalysisConfig(
        NORAD_ID,
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
        "Phase C parity test.",
        EPOCH);
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

  private static OrbitalElementDelta orbitalElementDelta(
      OrekitEnvironment environment,
      EphemerisState expected,
      EphemerisState actual) {
    KeplerianOrbit expectedOrbit = orbitFromState(environment, expected);
    KeplerianOrbit actualOrbit = orbitFromState(environment, actual);
    return new OrbitalElementDelta(
        Math.abs(expectedOrbit.getA() - actualOrbit.getA()),
        Math.abs(expectedOrbit.getE() - actualOrbit.getE()),
        Math.abs(expectedOrbit.getI() - actualOrbit.getI()));
  }

  private static KeplerianOrbit orbitFromState(OrekitEnvironment environment, EphemerisState state) {
    double[] position = state.positionKm();
    double[] velocity = state.velocityKmps();
    CartesianOrbit cartesian = new CartesianOrbit(
        new PVCoordinates(
            new Vector3D(position[0] * 1000.0, position[1] * 1000.0, position[2] * 1000.0),
            new Vector3D(velocity[0] * 1000.0, velocity[1] * 1000.0, velocity[2] * 1000.0)),
        environment.eme2000(),
        OrekitStateMapper.toAbsoluteDate(state.time()),
        Constants.EGM96_EARTH_MU);
    return new KeplerianOrbit(cartesian);
  }

  private record OrbitalElementDelta(double smaMeters, double eccentricity, double inclinationRadians) {
  }

  private static class FixedTimelinePropagationService extends MissionTimelinePropagationService {
    private final List<PropagationManeuverCommand> commands;

    FixedTimelinePropagationService(List<PropagationManeuverCommand> commands) {
      super(null, null, null, null);
      this.commands = commands;
    }

    @Override
    public List<PropagationManeuverCommand> requiredCommandsForMission(String missionId) {
      return commands;
    }
  }

  private static class InMemoryMissionRepository extends MissionRepository {
    private final Map<String, Mission> missions = new LinkedHashMap<>();

    InMemoryMissionRepository() {
      super(null);
    }

    @Override
    public Mission save(Mission mission) {
      missions.put(mission.id(), mission);
      return mission;
    }

    @Override
    public Optional<Mission> findById(String id) {
      return Optional.ofNullable(missions.get(id));
    }
  }
}
