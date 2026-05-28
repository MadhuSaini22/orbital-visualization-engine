package com.orbitvisualizationengine.server.dto.diagnostics;

public record ForceContribution(
    String name,
    double[] accelerationMps2,
    double magnitudeMps2,
    double contributionPercent,
    String frame) {
}
