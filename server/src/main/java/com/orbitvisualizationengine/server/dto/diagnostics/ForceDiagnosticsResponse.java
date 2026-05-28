package com.orbitvisualizationengine.server.dto.diagnostics;

import java.util.List;

public record ForceDiagnosticsResponse(
    int noradId,
    String model,
    String frame,
    List<ForceDiagnosticsSample> samples) {
}
