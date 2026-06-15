package com.orbitvisualizationengine.server.service;

import java.util.Map;

public record TargetingIteration(
    int iteration,
    double residualNorm,
    Map<String, Double> controls,
    Map<String, Double> residuals
) {
}
