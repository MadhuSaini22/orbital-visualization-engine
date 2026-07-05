package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import org.springframework.stereotype.Service;

@Service
public class ConjunctionService {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final PropagationService propagationService;
  private final RelativeMotionService relativeMotionService;
  private final ConjunctionEngine conjunctionEngine;

  public ConjunctionService(
      RuntimeSatelliteService runtimeSatelliteService,
      PropagationService propagationService,
      RelativeMotionService relativeMotionService,
      ConjunctionEngine conjunctionEngine) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.propagationService = propagationService;
    this.relativeMotionService = relativeMotionService;
    this.conjunctionEngine = conjunctionEngine;
  }

  public ConjunctionResult analyze(ConjunctionRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Conjunction request is required");
    }

    RuntimeSatellite primary = runtimeSatelliteService.findByNoradId(request.primaryNoradCatalogId());
    RuntimeSatellite secondary = runtimeSatelliteService.findByNoradId(request.secondaryNoradCatalogId());
    PropagationResult primaryPropagation = propagate(primary, request);
    PropagationResult secondaryPropagation = propagate(secondary, request);
    RelativeMotionResult relativeMotionResult = relativeMotionService.computeRelativeMotion(
        relativeMotionRequest(request),
        primaryPropagation,
        secondaryPropagation);

    return conjunctionEngine.analyze(request, relativeMotionResult);
  }

  private PropagationResult propagate(RuntimeSatellite satellite, ConjunctionRequest request) {
    return propagationService.propagate(
        satellite,
        request.startTime(),
        request.stopTime(),
        request.step());
  }

  private static RelativeMotionRequest relativeMotionRequest(ConjunctionRequest request) {
    return new RelativeMotionRequest(
        request.primaryNoradCatalogId(),
        request.secondaryNoradCatalogId(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.relativeFrame());
  }
}
