package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.ManeuverStatus;
import com.orbitvisualizationengine.server.dto.ManeuverPreviewRequest;
import com.orbitvisualizationengine.server.dto.ManeuverPreviewResponse;
import com.orbitvisualizationengine.server.repository.ManeuverRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ManeuverService {
  private final ManeuverRepository maneuvers;
  private final OrbitAnalysisService orbitAnalysis;

  public ManeuverService(ManeuverRepository maneuvers, OrbitAnalysisService orbitAnalysis) {
    this.maneuvers = maneuvers;
    this.orbitAnalysis = orbitAnalysis;
  }

  public List<ManeuverEvent> list(Integer noradId) {
    return maneuvers.findByNoradId(noradId);
  }

  public ManeuverPreviewResponse preview(ManeuverPreviewRequest request) {
    Instant eventTime = request.eventTime();
    int previewHours = Math.max(1, request.previewHours());
    Instant start = eventTime.minusSeconds(previewHours * 1800L);
    Instant end = eventTime.plusSeconds(previewHours * 1800L);

    ManeuverEvent event = new ManeuverEvent(
        "preview-" + UUID.randomUUID(),
        request.noradId(),
        request.name(),
        ManeuverStatus.CANDIDATE,
        eventTime,
        request.deltaVMps(),
        request.durationSec(),
        request.frame(),
        Map.of(
            "r", request.vector().getOrDefault("r", 0.0),
            "t", request.vector().getOrDefault("t", 0.0),
            "n", request.vector().getOrDefault("n", 0.0)),
        Map.of("source", "operator-preview", "model", "baseline-sgp4-window"));

    List<EphemerisState> preBurn = orbitAnalysis.propagate(request.noradId(), start, eventTime, 60);
    List<EphemerisState> postBurn = orbitAnalysis.propagate(request.noradId(), eventTime, end, 60);

    return new ManeuverPreviewResponse(
        event,
        preBurn,
        postBurn,
        List.of("Preview API is wired for real workflow. Post-burn states currently use baseline propagation until finite-burn Orekit modeling is enabled."));
  }

  public void save(ManeuverEvent event) {
    maneuvers.save(event);
  }
}
