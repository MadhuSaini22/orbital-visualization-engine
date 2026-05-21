package com.orbitvisualizationengine.server.domain;

import java.time.Instant;
import java.util.Map;

public record ManeuverEvent(
    String id,
    int noradId,
    String name,
    ManeuverStatus status,
    Instant eventTime,
    double deltaVMps,
    int durationSec,
    String frame,
    Map<String, Double> vector,
    Map<String, Object> metadata) {
}
