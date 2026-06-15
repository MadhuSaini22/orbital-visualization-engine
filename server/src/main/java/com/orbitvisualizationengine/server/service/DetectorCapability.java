package com.orbitvisualizationengine.server.service;

public record DetectorCapability(
    EventMarkerType eventType,
    String orekitClass,
    String status,
    String intendedUse
) {
}
