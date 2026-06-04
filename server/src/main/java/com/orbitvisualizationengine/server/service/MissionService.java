package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.dto.CreateMissionRequest;
import com.orbitvisualizationengine.server.repository.MissionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MissionService {
  private final MissionRepository missions;
  private final MissionTimelineValidator validator;
  private final PropagationProfileService propagationProfiles;

  @Autowired
  public MissionService(
      MissionRepository missions,
      MissionTimelineValidator validator,
      PropagationProfileService propagationProfiles) {
    this.missions = missions;
    this.validator = validator;
    this.propagationProfiles = propagationProfiles;
  }

  public MissionService(MissionRepository missions, MissionTimelineValidator validator) {
    this(missions, validator, null);
  }

  public Mission create(CreateMissionRequest request) {
    validator.validateMissionWindow(request.scenarioStart(), request.scenarioEnd());
    boolean hasNoradSubject = request.subjectNoradId() != null;
    boolean hasManualSubject = request.subjectOrbitId() != null && !request.subjectOrbitId().isBlank();
    if (hasNoradSubject == hasManualSubject) {
      throw new IllegalArgumentException("Mission must reference exactly one subject: subjectNoradId or subjectOrbitId.");
    }
    Instant now = Instant.now();
    Mission mission = missions.save(new Mission(
        "mission-" + UUID.randomUUID(),
        request.name().trim(),
        request.subjectNoradId(),
        hasManualSubject ? request.subjectOrbitId().trim() : null,
        request.propagatorType(),
        request.scenarioStart(),
        request.scenarioEnd(),
        now,
        now));
    if (propagationProfiles != null) {
      propagationProfiles.createMissionSnapshot(mission);
    }
    return mission;
  }

  public Mission get(String missionId) {
    return missions.findById(missionId)
        .orElseThrow(() -> new IllegalArgumentException("Mission not found: " + missionId));
  }

  public Mission lockForTimelineMutation(String missionId) {
    return missions.lockById(missionId)
        .orElseThrow(() -> new IllegalArgumentException("Mission not found: " + missionId));
  }

  public List<Mission> list() {
    return missions.findAll();
  }
}
