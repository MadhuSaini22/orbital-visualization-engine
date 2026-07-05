package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationService;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import org.springframework.stereotype.Service;

@Service
public class VisibilityService {
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final GroundStationService groundStationService;
  private final PropagationService propagationService;
  private final VisibilityEngine visibilityEngine;

  public VisibilityService(
      RuntimeSatelliteService runtimeSatelliteService,
      GroundStationService groundStationService,
      PropagationService propagationService,
      VisibilityEngine visibilityEngine) {
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.groundStationService = groundStationService;
    this.propagationService = propagationService;
    this.visibilityEngine = visibilityEngine;
  }

  public VisibilityResult computeVisibility(VisibilityRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Visibility request is required");
    }

    RuntimeSatellite satellite = runtimeSatelliteService.findByNoradId(request.noradCatalogId());
    GroundStation groundStation = groundStationService.findById(request.groundStationId());
    PropagationResult propagationResult = propagationService.propagate(
        satellite,
        request.startTime(),
        request.stopTime(),
        request.step());

    return visibilityEngine.computeVisibility(request, satellite, groundStation, propagationResult);
  }
}
