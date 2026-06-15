package com.orbitvisualizationengine.server.service;

public record ControlVariable(
    String name,
    String unit,
    double initialValue,
    double lowerBound,
    double upperBound
) {
}
