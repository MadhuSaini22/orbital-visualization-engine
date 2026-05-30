package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.dto.AnalysisConfigResponse;
import com.orbitvisualizationengine.server.dto.AnalysisConfigUpdateRequest;
import com.orbitvisualizationengine.server.dto.ModeToggleRequest;
import com.orbitvisualizationengine.server.service.AnalysisConfigService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/satellites/{noradId}/analysis-config")
public class SatelliteAnalysisController {
  private final AnalysisConfigService analysisConfigService;

  public SatelliteAnalysisController(AnalysisConfigService analysisConfigService) {
    this.analysisConfigService = analysisConfigService;
  }

  @GetMapping
  AnalysisConfigResponse get(@PathVariable int noradId) {
    return analysisConfigService.get(noradId);
  }

  @PatchMapping
  AnalysisConfigResponse update(
      @PathVariable int noradId,
      @Valid @RequestBody AnalysisConfigUpdateRequest request) {
    return analysisConfigService.update(noradId, request);
  }

  @PostMapping("/presets/{preset}")
  AnalysisConfigResponse preset(@PathVariable int noradId, @PathVariable AnalysisPreset preset) {
    return analysisConfigService.applyPreset(noradId, preset);
  }

  @PostMapping("/modes/{mode}")
  AnalysisConfigResponse mode(
      @PathVariable int noradId,
      @PathVariable String mode,
      @RequestParam(required = false) Boolean enabled,
      @RequestBody(required = false) ModeToggleRequest request) {
    boolean requestedEnabled = enabled != null
        ? enabled
        : request == null || request.enabled() == null || request.enabled();
    return analysisConfigService.setMode(noradId, mode, requestedEnabled);
  }
}
