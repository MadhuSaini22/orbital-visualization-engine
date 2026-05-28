package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.dto.AnalysisConfigResponse;
import com.orbitvisualizationengine.server.dto.PropagationComparisonResponse;
import com.orbitvisualizationengine.server.dto.PropagationRequest;
import com.orbitvisualizationengine.server.dto.PropagationResponse;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceDiagnosticsResponse;
import com.orbitvisualizationengine.server.service.AnalysisConfigService;
import com.orbitvisualizationengine.server.service.OrbitAnalysisService;
import com.orbitvisualizationengine.server.service.OrekitOrbitAnalysisService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orbits")
public class OrbitController {
  private final OrbitAnalysisService orbitAnalysis;
  private final OrekitOrbitAnalysisService orekitOrbitAnalysis;
  private final AnalysisConfigService analysisConfigService;

  public OrbitController(
      OrbitAnalysisService orbitAnalysis,
      OrekitOrbitAnalysisService orekitOrbitAnalysis,
      AnalysisConfigService analysisConfigService) {
    this.orbitAnalysis = orbitAnalysis;
    this.orekitOrbitAnalysis = orekitOrbitAnalysis;
    this.analysisConfigService = analysisConfigService;
  }

  @PostMapping("/propagate")
  PropagationResponse propagate(@Valid @RequestBody PropagationRequest request) {
    List<EphemerisState> states = orbitAnalysis.propagate(
        request.noradId(), request.start(), request.end(), request.stepSeconds());
    return propagationResponse(request.noradId(), states);
  }

  @GetMapping("/{noradId}/current")
  EphemerisState current(@PathVariable int noradId, @RequestParam(required = false) Instant time) {
    return orbitAnalysis.currentState(noradId, time == null ? Instant.now() : time);
  }

  @GetMapping("/{noradId}/trajectory")
  PropagationResponse trajectory(
      @PathVariable int noradId,
      @RequestParam Instant from,
      @RequestParam Instant to,
      @RequestParam(defaultValue = "30") int stepSeconds) {
    return propagationResponse(noradId, orbitAnalysis.propagate(noradId, from, to, stepSeconds));
  }

  @GetMapping("/{noradId}/force-diagnostics")
  ForceDiagnosticsResponse forceDiagnostics(
      @PathVariable int noradId,
      @RequestParam Instant from,
      @RequestParam Instant to,
      @RequestParam(defaultValue = "60") int stepSeconds) {
    return new ForceDiagnosticsResponse(
        noradId,
        "OREKIT_NUMERICAL",
        "EME2000",
        orekitOrbitAnalysis.forceDiagnostics(noradId, from, to, stepSeconds));
  }

  @GetMapping("/{noradId}/compare")
  PropagationComparisonResponse compare(
      @PathVariable int noradId,
      @RequestParam Instant from,
      @RequestParam Instant to,
      @RequestParam(defaultValue = "60") int stepSeconds) {
    List<PropagationComparisonResponse.ModelTrajectory> trajectories = orekitOrbitAnalysis.compare(noradId, from, to, stepSeconds)
        .stream()
        .map(item -> new PropagationComparisonResponse.ModelTrajectory(item.model(), item.states()))
        .toList();
    return new PropagationComparisonResponse(noradId, "ITRF", trajectories);
  }

  private PropagationResponse propagationResponse(int noradId, List<EphemerisState> states) {
    AnalysisConfigResponse config = analysisConfigService.get(noradId);
    return new PropagationResponse(
        noradId,
        config.config().propagatorType() == null ? "OREKIT_TLE_SGP4" : "OREKIT_" + config.config().propagatorType().name(),
        "ITRF",
        config.config(),
        config.warnings(),
        states);
  }
}
