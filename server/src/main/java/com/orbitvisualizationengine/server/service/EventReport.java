package com.orbitvisualizationengine.server.service;

import java.util.List;

public record EventReport(
    String missionId,
    List<EventMarker> markers,
    List<DetectorCapability> detectorCapabilities,
    List<String> notes
) {
}
