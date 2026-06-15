package com.orbitvisualizationengine.server.service;

public record AchieveVariable(
    String name,
    String unit,
    double targetValue,
    double tolerance
) {
}
