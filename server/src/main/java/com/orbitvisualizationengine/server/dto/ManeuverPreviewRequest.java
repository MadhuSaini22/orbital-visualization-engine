package com.orbitvisualizationengine.server.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Instant;
import java.util.Map;

public record ManeuverPreviewRequest(
    @NotNull Integer noradId,
    @NotBlank String name,
    @NotNull Instant eventTime,
    double deltaVMps,
    @Positive int durationSec,
    @NotBlank String frame,
    @NotNull Map<String, Double> vector,
    @Positive int previewHours) {
}
