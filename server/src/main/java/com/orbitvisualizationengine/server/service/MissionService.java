package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.dto.CreateMissionRequest;
import com.orbitvisualizationengine.server.repository.MissionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class MissionService {
  private final MissionRepository missions;
  private final MissionTimelineValidator validator;

  public MissionService(MissionRepository missions, MissionTimelineValidator validator) {
    this.missions = missions;
    this.validator = validator;
  }

  public Mission create(CreateMissionRequest request) {
    validator.validateMissionWindow(request.scenarioStart(), request.scenarioEnd());
    Instant now = Instant.now();
    return missions.save(new Mission(
        "mission-" + UUID.randomUUID(),
        request.name().trim(),
        request.propagatorType(),
        request.scenarioStart(),
        request.scenarioEnd(),
        now,
        now));
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
