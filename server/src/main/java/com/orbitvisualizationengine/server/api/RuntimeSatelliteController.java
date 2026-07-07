package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/satellites")
public class RuntimeSatelliteController {
  private final RuntimeSatelliteService runtimeSatelliteService;

  public RuntimeSatelliteController(RuntimeSatelliteService runtimeSatelliteService) {
    this.runtimeSatelliteService = runtimeSatelliteService;
  }

  @GetMapping("/{noradCatalogId}")
  RuntimeSatelliteResponse get(@PathVariable int noradCatalogId) {
    return RuntimeSatelliteResponse.from(runtimeSatelliteService.findByNoradId(noradCatalogId));
  }
}
