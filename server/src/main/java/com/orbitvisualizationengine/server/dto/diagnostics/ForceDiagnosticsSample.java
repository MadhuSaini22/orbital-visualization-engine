package com.orbitvisualizationengine.server.dto.diagnostics;

import java.time.Instant;
import java.util.List;

public record ForceDiagnosticsSample(
    Instant time,
    String frame,
    double[] totalAccelerationMps2,
    double totalAccelerationMagnitudeMps2,
    List<ForceContribution> contributions) {
}
