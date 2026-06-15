package com.orbitvisualizationengine.server.service;

import java.time.Instant;
import java.util.Map;

public record EventMarker(
    EventMarkerType type,
    Instant epoch,
    String label,
    String detectorClass,
    Map<String, Object> metadata
) {
}
