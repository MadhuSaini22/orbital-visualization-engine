package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/propagation")
public class RuntimePropagationController {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final PropagationService propagationService;

  public RuntimePropagationController(
      RuntimeSatelliteService runtimeSatelliteService,
      PropagationService propagationService) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.propagationService = propagationService;
  }

  @PostMapping
  RuntimePropagationResponse propagate(@Valid @RequestBody RuntimePropagationRequest request) {
    RuntimeSatellite satellite = runtimeSatelliteService.findByNoradId(request.noradCatalogId());
    return RuntimePropagationResponse.from(propagationService.propagate(
            satellite,
            request.start(),
            request.end(),
            Duration.ofSeconds(request.stepSeconds())));
  }
}
