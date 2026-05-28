package com.orbitvisualizationengine.server.propagation;

public record PropagationCapabilities(
    boolean supportsForceModels,
    boolean supportsManeuvers,
    boolean supportsCovariance,
    boolean supportsEventDetection) {
}
