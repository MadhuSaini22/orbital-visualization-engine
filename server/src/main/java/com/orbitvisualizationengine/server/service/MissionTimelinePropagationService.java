package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.config.AppProperties;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverCommand;
import com.orbitvisualizationengine.server.repository.MissionTimelineEventRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class MissionTimelinePropagationService {
  private final MissionService missions;
  private final MissionTimelineEventRepository timelineEvents;
  private final TimelineExecutor timelineExecutor;
  private final AppProperties properties;

  public MissionTimelinePropagationService(
      MissionService missions,
      MissionTimelineEventRepository timelineEvents,
      TimelineExecutor timelineExecutor,
      AppProperties properties) {
    this.missions = missions;
    this.timelineEvents = timelineEvents;
    this.timelineExecutor = timelineExecutor;
    this.properties = properties;
  }

  public List<PropagationManeuverCommand> commandsForMission(String missionId) {
    if (!properties.missionTimelinePropagationEnabled()) {
      return List.of();
    }
    return requiredCommandsForMission(missionId);
  }

  public List<PropagationManeuverCommand> requiredCommandsForMission(String missionId) {
    missions.get(missionId);
    List<MissionTimelineEvent> events = timelineEvents.findByMissionId(missionId);
    return timelineExecutor.toPropagationCommands(events);
  }

  public PropagationContext withMissionTimelineCommands(PropagationContext context, String missionId) {
    return context.withManeuverCommands(commandsForMission(missionId));
  }
}
