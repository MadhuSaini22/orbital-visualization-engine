package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseInterval;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseRequest;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseResult;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseService;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseType;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/eclipse")
public class EclipseController {
  private final EclipseService eclipseService;
  private final RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport;

  public EclipseController(
      EclipseService eclipseService,
      RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport) {
    this.eclipseService = eclipseService;
    this.runtimeOrbitAnalysisSupport = runtimeOrbitAnalysisSupport;
  }

  @PostMapping
  EclipseResult compute(@Valid @RequestBody EclipseRequest request) {
    return eclipseService.computeEclipses(request);
  }

  @PostMapping("/orbit")
  EclipseResult computeOrbit(@Valid @RequestBody RuntimeOrbitEclipseRequest request) {
    PropagationResult propagation = runtimeOrbitAnalysisSupport.propagate(
        request.primaryObject(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.propagatorType());
    EclipseRequest delegate = new EclipseRequest(
        runtimeOrbitAnalysisSupport.stableObjectId(request.primaryObject()),
        request.startTime(),
        request.stopTime(),
        request.step());
    return new EclipseResult(delegate, intervals(propagation));
  }

  private static List<EclipseInterval> intervals(PropagationResult propagation) {
    List<EclipseInterval> intervals = new ArrayList<>();
    PropagatedState previous = null;
    EclipseType currentType = null;
    for (PropagatedState state : propagation.states()) {
      EclipseType type = classify(state.position());
      if (previous == null) {
        previous = state;
        currentType = type;
      } else if (type != currentType) {
        intervals.add(interval(currentType, previous, state));
        previous = state;
        currentType = type;
      }
    }
    if (previous != null) {
      PropagatedState last = propagation.states().getLast();
      intervals.add(interval(currentType, previous, last));
    }
    return List.copyOf(intervals);
  }

  private static EclipseInterval interval(EclipseType type, PropagatedState start, PropagatedState stop) {
    return new EclipseInterval(type, start.timestamp(), stop.timestamp(), Duration.between(start.timestamp(), stop.timestamp()));
  }

  private static EclipseType classify(CartesianVector position) {
    double earthRadiusMeters = 6378137.0;
    double sunX = 1.0;
    double alongSun = position.xMeters() * sunX;
    double crossTrack = Math.sqrt(position.yMeters() * position.yMeters() + position.zMeters() * position.zMeters());
    if (alongSun < 0.0 && crossTrack < earthRadiusMeters) {
      return EclipseType.UMBRA;
    }
    if (alongSun < 0.0 && crossTrack < earthRadiusMeters * 1.08) {
      return EclipseType.PENUMBRA;
    }
    return EclipseType.SUNLIGHT;
  }
}
