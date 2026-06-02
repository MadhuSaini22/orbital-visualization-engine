package com.orbitvisualizationengine.server.propagation;

public interface MissionPropagationContextFactory {
  PropagationContext buildLegacyFreeContext(int noradId);

  PropagationContext buildManualOrbitContext(String orbitId);
}
