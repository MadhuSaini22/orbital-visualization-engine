package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import org.springframework.stereotype.Service;

@Service
public class RelativeMotionService {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final PropagationService propagationService;
  private final RelativeMotionEngine relativeMotionEngine;

  public RelativeMotionService(
      RuntimeSatelliteService runtimeSatelliteService,
      PropagationService propagationService,
      RelativeMotionEngine relativeMotionEngine) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.propagationService = propagationService;
    this.relativeMotionEngine = relativeMotionEngine;
  }

  public RelativeMotionResult computeRelativeMotion(RelativeMotionRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Relative motion request is required");
    }

    RuntimeSatellite primary = runtimeSatelliteService.findByNoradId(request.primaryNoradCatalogId());
    RuntimeSatellite secondary = runtimeSatelliteService.findByNoradId(request.secondaryNoradCatalogId());
    PropagationResult primaryPropagation = propagate(primary, request);
    PropagationResult secondaryPropagation = propagate(secondary, request);

    return relativeMotionEngine.computeRelativeMotion(request, primaryPropagation, secondaryPropagation);
  }

  public RelativeMotionResult computeRelativeMotion(
      RelativeMotionRequest request,
      PropagationResult primaryPropagation,
      PropagationResult secondaryPropagation) {
    if (request == null) {
      throw new IllegalArgumentException("Relative motion request is required");
    }
    if (primaryPropagation == null) {
      throw new IllegalArgumentException("Primary propagation result is required");
    }
    if (secondaryPropagation == null) {
      throw new IllegalArgumentException("Secondary propagation result is required");
    }
    return relativeMotionEngine.computeRelativeMotion(request, primaryPropagation, secondaryPropagation);
  }

  private PropagationResult propagate(RuntimeSatellite satellite, RelativeMotionRequest request) {
    return propagationService.propagate(
        satellite,
        request.startTime(),
        request.stopTime(),
        request.step());
  }
}
