package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseRequest;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseResult;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/eclipse")
public class EclipseController {
  private final EclipseService eclipseService;

  public EclipseController(EclipseService eclipseService) {
    this.eclipseService = eclipseService;
  }

  @PostMapping
  EclipseResult compute(@Valid @RequestBody EclipseRequest request) {
    return eclipseService.computeEclipses(request);
  }
}
