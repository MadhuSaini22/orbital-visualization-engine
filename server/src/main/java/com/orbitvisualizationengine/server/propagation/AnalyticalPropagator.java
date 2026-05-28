package com.orbitvisualizationengine.server.propagation;

public abstract class AnalyticalPropagator implements OrbitPropagator {
  private static final PropagationCapabilities CAPABILITIES =
      new PropagationCapabilities(false, false, false, true);

  @Override
  public PropagationCapabilities capabilities() {
    return CAPABILITIES;
  }
}
