package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.dto.CreatedOrbitResponse;
import com.orbitvisualizationengine.server.dto.CreateOrbitRequest;
import com.orbitvisualizationengine.server.dto.PropagationResponse;
import com.orbitvisualizationengine.server.service.ManualOrbitService;
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
@RequestMapping("/api/manual-orbits")
public class ManualOrbitController {
  private final ManualOrbitService manualOrbitService;

  public ManualOrbitController(ManualOrbitService manualOrbitService) {
    this.manualOrbitService = manualOrbitService;
  }

  @PostMapping
  CreatedOrbitResponse create(@Valid @RequestBody CreateOrbitRequest request) {
    ManualOrbitRecord orbit = manualOrbitService.create(request);
    return CreatedOrbitResponse.from(orbit, manualOrbitService.warnings(orbit));
  }

  @GetMapping("/{orbitId}")
  CreatedOrbitResponse get(@PathVariable String orbitId) {
    ManualOrbitRecord orbit = manualOrbitService.get(orbitId);
    return CreatedOrbitResponse.from(orbit, manualOrbitService.warnings(orbit));
  }

  @GetMapping("/{orbitId}/current")
  EphemerisState current(
      @PathVariable String orbitId,
      @RequestParam(required = false) Instant time,
      @RequestParam(required = false) PropagatorType propagatorType) {
    return manualOrbitService.currentState(orbitId, time == null ? Instant.now() : time, propagatorType);
  }

  @GetMapping("/{orbitId}/trajectory")
  PropagationResponse trajectory(
      @PathVariable String orbitId,
      @RequestParam Instant from,
      @RequestParam Instant to,
      @RequestParam(defaultValue = "30") int stepSeconds,
      @RequestParam(required = false) PropagatorType propagatorType) {
    ManualOrbitRecord orbit = manualOrbitService.get(orbitId);
    PropagatorType selectedType = propagatorType == null ? orbit.propagatorType() : propagatorType;
    List<EphemerisState> states = manualOrbitService.propagate(orbitId, from, to, stepSeconds, selectedType);
    return new PropagationResponse(
        0,
        "OREKIT_" + selectedType.name(),
        "ITRF",
        null,
        manualOrbitService.warnings(orbit),
        states);
  }
}
