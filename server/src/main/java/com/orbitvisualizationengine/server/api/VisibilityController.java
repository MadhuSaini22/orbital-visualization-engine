package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityService;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityWindow;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/visibility")
public class VisibilityController {
  private final VisibilityService visibilityService;
  private final GroundStationService groundStationService;
  private final RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport;

  public VisibilityController(
      VisibilityService visibilityService,
      GroundStationService groundStationService,
      RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport) {
    this.visibilityService = visibilityService;
    this.groundStationService = groundStationService;
    this.runtimeOrbitAnalysisSupport = runtimeOrbitAnalysisSupport;
  }

  @PostMapping
  VisibilityResult compute(@Valid @RequestBody VisibilityRequest request) {
    return visibilityService.computeVisibility(request);
  }

  @PostMapping("/orbit")
  VisibilityResult computeOrbit(@Valid @RequestBody RuntimeOrbitVisibilityRequest request) {
    PropagationResult propagation = runtimeOrbitAnalysisSupport.propagate(
        request.primaryObject(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.propagatorType());
    GroundStation groundStation = groundStationService.findById(request.groundStationId());
    VisibilityRequest delegate = new VisibilityRequest(
        runtimeOrbitAnalysisSupport.stableObjectId(request.primaryObject()),
        request.groundStationId(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.minimumElevationDegrees());
    return new VisibilityResult(delegate, windows(delegate, propagation, groundStation));
  }

  private static List<VisibilityWindow> windows(
      VisibilityRequest request,
      PropagationResult propagation,
      GroundStation groundStation) {
    List<VisibilityWindow> windows = new ArrayList<>();
    Instant aos = null;
    PropagatedState maxState = null;
    double maxElevation = Double.NEGATIVE_INFINITY;
    for (PropagatedState state : propagation.states()) {
      double elevation = elevationDegrees(state.position(), groundStation);
      boolean visible = elevation >= request.minimumElevationDegrees();
      if (visible && aos == null) {
        aos = state.timestamp();
        maxState = state;
        maxElevation = elevation;
      }
      if (visible && elevation > maxElevation) {
        maxState = state;
        maxElevation = elevation;
      }
      if (!visible && aos != null) {
        windows.add(new VisibilityWindow(
            aos,
            state.timestamp(),
            maxState.timestamp(),
            maxElevation,
            Duration.between(aos, state.timestamp())));
        aos = null;
        maxState = null;
        maxElevation = Double.NEGATIVE_INFINITY;
      }
    }
    if (aos != null && maxState != null) {
      Instant los = propagation.states().getLast().timestamp();
      windows.add(new VisibilityWindow(
          aos,
          los,
          maxState.timestamp(),
          maxElevation,
          Duration.between(aos, los)));
    }
    return List.copyOf(windows);
  }

  private static double elevationDegrees(CartesianVector satellitePositionMeters, GroundStation groundStation) {
    double latitude = Math.toRadians(groundStation.position().latitudeDegrees());
    double longitude = Math.toRadians(groundStation.position().longitudeDegrees());
    double stationRadius = 6378137.0 + groundStation.position().altitudeMeters();
    double stationX = stationRadius * Math.cos(latitude) * Math.cos(longitude);
    double stationY = stationRadius * Math.cos(latitude) * Math.sin(longitude);
    double stationZ = stationRadius * Math.sin(latitude);
    double dx = satellitePositionMeters.xMeters() - stationX;
    double dy = satellitePositionMeters.yMeters() - stationY;
    double dz = satellitePositionMeters.zMeters() - stationZ;
    double upX = Math.cos(latitude) * Math.cos(longitude);
    double upY = Math.cos(latitude) * Math.sin(longitude);
    double upZ = Math.sin(latitude);
    double range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (range == 0.0) {
      return -90.0;
    }
    return Math.toDegrees(Math.asin((dx * upX + dy * upY + dz * upZ) / range));
  }
}
