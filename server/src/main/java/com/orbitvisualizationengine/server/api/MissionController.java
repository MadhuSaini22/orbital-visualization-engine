package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.dto.CreateMissionRequest;
import com.orbitvisualizationengine.server.dto.CreateTimelineEventRequest;
import com.orbitvisualizationengine.server.dto.MissionTrajectoryRequest;
import com.orbitvisualizationengine.server.dto.MissionResponse;
import com.orbitvisualizationengine.server.dto.MissionTimelineEventResponse;
import com.orbitvisualizationengine.server.dto.PropagationResponse;
import com.orbitvisualizationengine.server.dto.ReorderTimelineRequest;
import com.orbitvisualizationengine.server.dto.UpdateTimelineEventRequest;
import com.orbitvisualizationengine.server.service.AnalysisConfigService;
import com.orbitvisualizationengine.server.service.MissionService;
import com.orbitvisualizationengine.server.service.MissionTimelineService;
import com.orbitvisualizationengine.server.service.MissionTrajectoryService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/missions")
public class MissionController {
  private final MissionService missions;
  private final MissionTimelineService timeline;
  private final MissionTrajectoryService trajectories;
  private final AnalysisConfigService analysisConfigService;

  public MissionController(
      MissionService missions,
      MissionTimelineService timeline,
      MissionTrajectoryService trajectories,
      AnalysisConfigService analysisConfigService) {
    this.missions = missions;
    this.timeline = timeline;
    this.trajectories = trajectories;
    this.analysisConfigService = analysisConfigService;
  }

  @PostMapping
  MissionResponse create(@Valid @RequestBody CreateMissionRequest request) {
    return MissionResponse.from(missions.create(request));
  }

  @GetMapping
  List<MissionResponse> list() {
    return missions.list().stream()
        .map(MissionResponse::from)
        .toList();
  }

  @GetMapping("/{missionId}")
  MissionResponse get(@PathVariable String missionId) {
    return MissionResponse.from(missions.get(missionId));
  }

  @GetMapping("/{missionId}/timeline/events")
  List<MissionTimelineEventResponse> events(@PathVariable String missionId) {
    return timeline.list(missionId).stream()
        .map(MissionTimelineEventResponse::from)
        .toList();
  }

  @PostMapping("/{missionId}/timeline/events")
  MissionTimelineEventResponse createEvent(
      @PathVariable String missionId,
      @Valid @RequestBody CreateTimelineEventRequest request) {
    return MissionTimelineEventResponse.from(timeline.create(missionId, request));
  }

  @PatchMapping("/{missionId}/timeline/events/{eventId}")
  MissionTimelineEventResponse updateEvent(
      @PathVariable String missionId,
      @PathVariable String eventId,
      @RequestBody UpdateTimelineEventRequest request) {
    return MissionTimelineEventResponse.from(timeline.update(missionId, eventId, request));
  }

  @DeleteMapping("/{missionId}/timeline/events/{eventId}")
  void deleteEvent(@PathVariable String missionId, @PathVariable String eventId) {
    timeline.delete(missionId, eventId);
  }

  @PostMapping("/{missionId}/timeline/events/reorder")
  List<MissionTimelineEventResponse> reorderEvents(
      @PathVariable String missionId,
      @Valid @RequestBody ReorderTimelineRequest request) {
    return timeline.reorder(missionId, request.eventIds()).stream()
        .map(MissionTimelineEventResponse::from)
        .toList();
  }

  @PostMapping("/{missionId}/timeline/events/{eventId}/enable")
  MissionTimelineEventResponse enableEvent(@PathVariable String missionId, @PathVariable String eventId) {
    return MissionTimelineEventResponse.from(timeline.setEnabled(missionId, eventId, true));
  }

  @PostMapping("/{missionId}/timeline/events/{eventId}/disable")
  MissionTimelineEventResponse disableEvent(@PathVariable String missionId, @PathVariable String eventId) {
    return MissionTimelineEventResponse.from(timeline.setEnabled(missionId, eventId, false));
  }

  @PostMapping("/{missionId}/trajectory")
  PropagationResponse trajectory(
      @PathVariable String missionId,
      @Valid @RequestBody MissionTrajectoryRequest request) {
    var states = trajectories.trajectory(missionId, request);
    var mission = missions.get(missionId);
    var config = mission.subjectNoradId() == null ? null : analysisConfigService.get(mission.subjectNoradId());
    return new PropagationResponse(
        mission.subjectNoradId() == null ? 0 : mission.subjectNoradId(),
        "OREKIT_NUMERICAL",
        "ITRF",
        config == null ? null : config.config(),
        config == null ? List.of() : config.warnings(),
        states);
  }
}
