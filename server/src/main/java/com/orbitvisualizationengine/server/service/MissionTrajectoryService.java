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
import org.springframework.stereotype.Service;

@Service
public class MissionTrajectoryService {
  private final MissionService missions;
  private final MissionTimelinePropagationService timelinePropagation;
  private final MissionPropagationContextFactory contextFactory;
  private final NumericalPropagator numericalPropagator;

  public MissionTrajectoryService(
      MissionService missions,
      MissionTimelinePropagationService timelinePropagation,
      MissionPropagationContextFactory contextFactory,
      NumericalPropagator numericalPropagator) {
    this.missions = missions;
    this.timelinePropagation = timelinePropagation;
    this.contextFactory = contextFactory;
    this.numericalPropagator = numericalPropagator;
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
    context = context
        .withManeuverCommands(commands);
    return numericalPropagator.trajectory(context, request.startTime(), request.endTime(), request.stepSeconds());
  }
}
