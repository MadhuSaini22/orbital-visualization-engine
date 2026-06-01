package com.orbitvisualizationengine.server.propagation;

@FunctionalInterface
public interface MissionPropagationContextFactory {
  PropagationContext buildLegacyFreeContext(int noradId);
}
