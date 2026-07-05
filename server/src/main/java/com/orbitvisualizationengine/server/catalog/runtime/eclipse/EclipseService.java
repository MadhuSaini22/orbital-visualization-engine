package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import org.springframework.stereotype.Service;

@Service
public class EclipseService {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final PropagationService propagationService;
  private final EclipseEngine eclipseEngine;

  public EclipseService(
      RuntimeSatelliteService runtimeSatelliteService,
      PropagationService propagationService,
      EclipseEngine eclipseEngine) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.propagationService = propagationService;
    this.eclipseEngine = eclipseEngine;
  }

  public EclipseResult computeEclipses(EclipseRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Eclipse request is required");
    }

    RuntimeSatellite satellite = runtimeSatelliteService.findByNoradId(request.noradCatalogId());
    PropagationResult propagationResult = propagationService.propagate(
        satellite,
        request.startTime(),
        request.stopTime(),
        request.step());

    return eclipseEngine.computeEclipses(request, propagationResult);
  }
}
