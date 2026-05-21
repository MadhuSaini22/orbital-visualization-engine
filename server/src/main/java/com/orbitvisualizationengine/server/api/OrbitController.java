package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.dto.PropagationRequest;
import com.orbitvisualizationengine.server.dto.PropagationResponse;
import com.orbitvisualizationengine.server.service.OrbitAnalysisService;
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

  public OrbitController(OrbitAnalysisService orbitAnalysis) {
    this.orbitAnalysis = orbitAnalysis;
  }

  @PostMapping("/propagate")
  PropagationResponse propagate(@Valid @RequestBody PropagationRequest request) {
    List<EphemerisState> states = orbitAnalysis.propagate(
        request.noradId(), request.start(), request.end(), request.stepSeconds());
    return new PropagationResponse(request.noradId(), "OREKIT_TLE_SGP4", "ITRF", states);
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
    return new PropagationResponse(
        noradId, "OREKIT_TLE_SGP4", "ITRF", orbitAnalysis.propagate(noradId, from, to, stepSeconds));
  }
}
