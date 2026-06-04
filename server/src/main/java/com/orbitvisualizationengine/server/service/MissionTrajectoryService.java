package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.dto.MissionTrajectoryRequest;
import com.orbitvisualizationengine.server.propagation.MissionPropagationContextFactory;
import com.orbitvisualizationengine.server.propagation.NumericalPropagator;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverCommand;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MissionTrajectoryService {
  private final MissionService missions;
  private final MissionTimelinePropagationService timelinePropagation;
  private final MissionPropagationContextFactory contextFactory;
  private final NumericalPropagator numericalPropagator;
  private final PropagationProfileService propagationProfiles;

  @Autowired
  public MissionTrajectoryService(
      MissionService missions,
      MissionTimelinePropagationService timelinePropagation,
      MissionPropagationContextFactory contextFactory,
      NumericalPropagator numericalPropagator,
      PropagationProfileService propagationProfiles) {
    this.missions = missions;
    this.timelinePropagation = timelinePropagation;
    this.contextFactory = contextFactory;
    this.numericalPropagator = numericalPropagator;
    this.propagationProfiles = propagationProfiles;
  }

  public MissionTrajectoryService(
      MissionService missions,
      MissionTimelinePropagationService timelinePropagation,
      MissionPropagationContextFactory contextFactory,
      NumericalPropagator numericalPropagator) {
    this(missions, timelinePropagation, contextFactory, numericalPropagator, null);
  }

  public List<EphemerisState> trajectory(String missionId, MissionTrajectoryRequest request) {
    if (!missionId.equals(request.missionId())) {
      throw new IllegalArgumentException("Request missionId must match path missionId.");
    }
    Mission mission = missions.get(missionId);
    if (mission.subjectNoradId() == null && mission.subjectOrbitId() == null) {
      throw new IllegalArgumentException("Mission trajectory requires subjectNoradId or subjectOrbitId: " + missionId);
    }
    if (mission.propagatorType() != PropagatorType.NUMERICAL) {
      throw new IllegalArgumentException("Mission trajectory maneuvers require NUMERICAL propagation: " + missionId);
    }
    if (request.startTime().isAfter(request.endTime())) {
      return List.of();
    }

    List<PropagationManeuverCommand> commands =
        timelinePropagation.requiredCommandsForMission(missionId);
    PropagationContext context = mission.subjectOrbitId() == null
        ? contextFactory.buildLegacyFreeContext(mission.subjectNoradId())
        : contextFactory.buildManualOrbitContext(mission.subjectOrbitId());
    var missionConfig = propagationProfiles == null
        ? context.analysisConfig()
        : propagationProfiles.missionAnalysisConfig(mission);
    if (!commands.isEmpty() && !missionConfig.maneuverModelEnabled()) {
      throw new IllegalArgumentException(
          "Mission contains finite-burn events, but the mission propagation profile has maneuver model disabled.");
    }
    context = context
        .withAnalysisConfig(missionConfig)
        .withManeuverCommands(commands);
    return numericalPropagator.trajectory(context, request.startTime(), request.endTime(), request.stepSeconds());
  }
}
