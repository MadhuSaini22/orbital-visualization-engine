package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.dto.ManeuverPreviewRequest;
import com.orbitvisualizationengine.server.dto.ManeuverPreviewResponse;
import com.orbitvisualizationengine.server.service.ManeuverService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/maneuvers")
public class ManeuverController {
  private final ManeuverService maneuverService;

  public ManeuverController(ManeuverService maneuverService) {
    this.maneuverService = maneuverService;
  }

  @GetMapping
  List<ManeuverEvent> list(@RequestParam(required = false) Integer noradId) {
    return maneuverService.list(noradId);
  }

  @PostMapping
  ManeuverEvent create(@Valid @RequestBody ManeuverEvent maneuver) {
    maneuverService.save(maneuver);
    return maneuver;
  }

  @PostMapping("/preview")
  ManeuverPreviewResponse preview(@Valid @RequestBody ManeuverPreviewRequest request) {
    return maneuverService.preview(request);
  }
}
