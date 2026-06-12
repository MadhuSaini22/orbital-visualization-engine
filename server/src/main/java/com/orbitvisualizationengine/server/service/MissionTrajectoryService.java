package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.PropagationProfile;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.dto.MissionTrajectoryRequest;
import com.orbitvisualizationengine.server.propagation.KeplerianPropagator;
import com.orbitvisualizationengine.server.propagation.MissionPropagationContextFactory;
import com.orbitvisualizationengine.server.propagation.NumericalPropagator;
import com.orbitvisualizationengine.server.propagation.NumericalIntegratorSettings;
import com.orbitvisualizationengine.server.propagation.OrbitPropagator;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverCommand;
import com.orbitvisualizationengine.server.propagation.SGP4Propagator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MissionTrajectoryService {
  private final MissionService missions;
  private final MissionTimelinePropagationService timelinePropagation;
  private final MissionPropagationContextFactory contextFactory;
  private final NumericalPropagator numericalPropagator;
  private final KeplerianPropagator keplerianPropagator;
  private final SGP4Propagator sgp4Propagator;
  private final PropagationProfileService propagationProfiles;

  @Autowired
  public MissionTrajectoryService(
      MissionService missions,
      MissionTimelinePropagationService timelinePropagation,
      MissionPropagationContextFactory contextFactory,
      NumericalPropagator numericalPropagator,
      KeplerianPropagator keplerianPropagator,
      SGP4Propagator sgp4Propagator,
      PropagationProfileService propagationProfiles) {
    this.missions = missions;
    this.timelinePropagation = timelinePropagation;
    this.contextFactory = contextFactory;
    this.numericalPropagator = numericalPropagator;
    this.keplerianPropagator = keplerianPropagator;
    this.sgp4Propagator = sgp4Propagator;
    this.propagationProfiles = propagationProfiles;
  }

  public MissionTrajectoryService(
      MissionService missions,
      MissionTimelinePropagationService timelinePropagation,
      MissionPropagationContextFactory contextFactory,
      NumericalPropagator numericalPropagator) {
    this(missions, timelinePropagation, contextFactory, numericalPropagator, null, null, null);
  }

  public List<EphemerisState> trajectory(String missionId, MissionTrajectoryRequest request) {
    return trajectoryResult(missionId, request).states();
  }

  public MissionTrajectoryResult trajectoryResult(String missionId, MissionTrajectoryRequest request) {
    if (!missionId.equals(request.missionId())) {
      throw new IllegalArgumentException("Request missionId must match path missionId.");
    }
    Mission mission = missions.get(missionId);
    if (mission.subjectNoradId() == null && mission.subjectOrbitId() == null) {
      throw new IllegalArgumentException("Mission trajectory requires subjectNoradId or subjectOrbitId: " + missionId);
    }
    if (request.startTime().isAfter(request.endTime())) {
      var emptyConfig = propagationProfiles == null ? null : propagationProfiles.missionAnalysisConfig(mission);
      return new MissionTrajectoryResult("EMPTY_TRAJECTORY", emptyConfig, List.of());
    }

    List<PropagationManeuverCommand> commands =
        timelinePropagation.requiredCommandsForMission(missionId);
    PropagationContext context = mission.subjectOrbitId() == null
        ? contextFactory.buildLegacyFreeContext(mission.subjectNoradId())
        : contextFactory.buildManualOrbitContext(mission.subjectOrbitId());
    PropagationProfile missionProfile = propagationProfiles == null ? null : propagationProfiles.getOrCreateMissionProfile(mission);
    var missionConfig = missionProfile == null
        ? context.analysisConfig()
        : missionProfile.toAnalysisConfig(mission.subjectNoradId() == null ? 0 : mission.subjectNoradId());
    context = context
        .withAnalysisConfig(missionConfig)
        .withManeuverCommands(commands);
    if (missionProfile != null) {
      context = context.withIntegratorSettings(NumericalIntegratorSettings.fromProfile(missionProfile));
    }
    OrbitPropagator selected = selectPropagator(missionConfig.propagatorType());
    if (!commands.isEmpty() && !selected.supportsManeuvers()) {
      throw new IllegalArgumentException(
          "Mission contains maneuver events, but " + missionConfig.propagatorType() + " propagation does not support maneuver execution. Select NUMERICAL propagation or disable burn events.");
    }
    if (!commands.isEmpty() && !missionConfig.maneuverModelEnabled()) {
      throw new IllegalArgumentException(
          "Mission contains maneuver events, but the mission propagation profile has maneuver model disabled.");
    }
    return new MissionTrajectoryResult(
        selected.name(),
        missionConfig,
        selected.trajectory(context, request.startTime(), request.endTime(), request.stepSeconds()));
  }

  private OrbitPropagator selectPropagator(PropagatorType type) {
    return switch (type) {
      case NUMERICAL -> numericalPropagator;
      case KEPLERIAN -> {
        if (keplerianPropagator == null) {
          throw new IllegalStateException("Keplerian propagator is not available.");
        }
        yield keplerianPropagator;
      }
      case TLE_SGP4 -> {
        if (sgp4Propagator == null) {
          throw new IllegalStateException("SGP4 propagator is not available.");
        }
        yield sgp4Propagator;
      }
    };
  }
}
