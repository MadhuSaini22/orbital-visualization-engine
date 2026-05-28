package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public interface OrbitPropagator {
  String name();

  EphemerisState propagate(PropagationContext context, Instant date);

  default List<EphemerisState> trajectory(
      PropagationContext context,
      Instant start,
      Instant end,
      int stepSeconds) {
    List<EphemerisState> states = new ArrayList<>();
    for (Instant cursor = start; !cursor.isAfter(end); cursor = cursor.plusSeconds(stepSeconds)) {
      states.add(propagate(context, cursor));
    }
    return states;
  }

  PropagationCapabilities capabilities();

  default boolean supportsForceModels() {
    return capabilities().supportsForceModels();
  }

  default boolean supportsManeuvers() {
    return capabilities().supportsManeuvers();
  }

  default boolean supportsCovariance() {
    return capabilities().supportsCovariance();
  }

  default boolean supportsEventDetection() {
    return capabilities().supportsEventDetection();
  }
}
