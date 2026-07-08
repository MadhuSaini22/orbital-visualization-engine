package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.service.ManualOrbitService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class RuntimeOrbitAnalysisSupport {
  private final ManualOrbitService manualOrbitService;
  private final RuntimeSatelliteService runtimeSatelliteService;
  private final PropagationService propagationService;

  public RuntimeOrbitAnalysisSupport(
      ManualOrbitService manualOrbitService,
      RuntimeSatelliteService runtimeSatelliteService,
      PropagationService propagationService) {
    this.manualOrbitService = manualOrbitService;
    this.runtimeSatelliteService = runtimeSatelliteService;
    this.propagationService = propagationService;
  }

  public PropagationResult propagate(
      RuntimeObjectRef object,
      Instant startTime,
      Instant stopTime,
      Duration step,
      PropagatorType propagatorType) {
    if (object == null) {
      throw new IllegalArgumentException("Runtime object is required");
    }
    return switch (object.type()) {
      case CATALOG_NORAD -> propagateCatalog(object.noradCatalogId(), startTime, stopTime, step);
      case MANUAL_ORBIT -> propagateManualOrbit(object, startTime, stopTime, step, propagatorType);
    };
  }

  public int stableObjectId(RuntimeObjectRef object) {
    if (object.type() == RuntimeObjectType.CATALOG_NORAD) {
      return object.noradCatalogId();
    }
    String stableKey = object.orbitId() != null
        ? object.orbitId()
        : object.orbitDefinition().name() + ":" + object.orbitDefinition().type();
    return Math.floorMod(stableKey.hashCode(), Integer.MAX_VALUE - 1) + 1;
  }

  private PropagationResult propagateCatalog(
      int noradCatalogId,
      Instant startTime,
      Instant stopTime,
      Duration step) {
    RuntimeSatellite satellite = runtimeSatelliteService.findByNoradId(noradCatalogId);
    return propagationService.propagate(satellite, startTime, stopTime, step);
  }

  private PropagationResult propagateManualOrbit(
      RuntimeObjectRef object,
      Instant startTime,
      Instant stopTime,
      Duration step,
      PropagatorType propagatorType) {
    int stepSeconds = Math.toIntExact(step.toSeconds());
    List<EphemerisState> ephemerisStates;
    if (object.orbitId() != null) {
      try {
        ephemerisStates = manualOrbitService.propagate(
            object.orbitId(),
            startTime,
            stopTime,
            stepSeconds,
            propagatorType);
      } catch (IllegalArgumentException exception) {
        if (object.orbitDefinition() == null) {
          throw exception;
        }
        ephemerisStates = manualOrbitService.propagate(
            object.orbitDefinition(),
            startTime,
            stopTime,
            stepSeconds,
            propagatorType);
      }
    } else {
      ephemerisStates = manualOrbitService.propagate(
          object.orbitDefinition(),
          startTime,
          stopTime,
          stepSeconds,
          propagatorType);
    }
    List<PropagatedState> states = ephemerisStates.stream()
        .map(RuntimeOrbitAnalysisSupport::toPropagatedState)
        .toList();
    return new PropagationResult(null, startTime, stopTime, step, states);
  }

  private static PropagatedState toPropagatedState(EphemerisState state) {
    double[] positionKm = state.positionKm();
    double[] velocityKmps = state.velocityKmps();
    return new PropagatedState(
        state.time(),
        state.frame(),
        new CartesianVector(positionKm[0] * 1000.0, positionKm[1] * 1000.0, positionKm[2] * 1000.0),
        new CartesianVector(velocityKmps[0] * 1000.0, velocityKmps[1] * 1000.0, velocityKmps[2] * 1000.0));
  }
}
