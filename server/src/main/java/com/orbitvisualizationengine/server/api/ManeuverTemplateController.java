package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.dto.ManeuverTemplateApplyResponse;
import com.orbitvisualizationengine.server.dto.ManeuverTemplatePreview;
import com.orbitvisualizationengine.server.dto.ManeuverTemplateRequest;
import com.orbitvisualizationengine.server.service.ManeuverTemplateService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/missions/{missionId}/maneuver-templates")
public class ManeuverTemplateController {
  private final ManeuverTemplateService maneuverTemplates;

  public ManeuverTemplateController(ManeuverTemplateService maneuverTemplates) {
    this.maneuverTemplates = maneuverTemplates;
  }

  @PostMapping("/preview")
  ManeuverTemplatePreview preview(
      @PathVariable String missionId,
      @Valid @RequestBody ManeuverTemplateRequest request) {
    return maneuverTemplates.preview(missionId, request);
  }

  @PostMapping("/apply")
  ManeuverTemplateApplyResponse apply(
      @PathVariable String missionId,
      @Valid @RequestBody ManeuverTemplateRequest request) {
    return maneuverTemplates.apply(missionId, request);
  }
}
