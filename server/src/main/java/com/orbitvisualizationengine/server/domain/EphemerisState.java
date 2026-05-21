package com.orbitvisualizationengine.server.domain;

import java.time.Instant;

public record EphemerisState(
    Instant time,
    String frame,
    double[] positionKm,
    double[] velocityKmps,
    Double latitudeDeg,
    Double longitudeDeg,
    Double altitudeKm) {
}
