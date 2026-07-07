package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/visibility")
public class VisibilityController {
  private final VisibilityService visibilityService;

  public VisibilityController(VisibilityService visibilityService) {
    this.visibilityService = visibilityService;
  }

  @PostMapping
  VisibilityResult compute(@Valid @RequestBody VisibilityRequest request) {
    return visibilityService.computeVisibility(request);
  }
}
