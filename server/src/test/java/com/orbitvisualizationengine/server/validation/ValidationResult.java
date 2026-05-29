package com.orbitvisualizationengine.server.validation;

import java.util.List;

/**
 * Outcome of one named validation suite, composed of one or more
 * {@link ValidationMetrics} and optional numerical warnings.
 */
public record ValidationResult(
    String testName,
    String referenceSource,
    String description,
    List<ValidationMetrics> metrics,
    List<String> warnings,
    boolean passed
) {

    public static ValidationResult of(
            String name, String source, String description,
            List<ValidationMetrics> metrics) {
        return of(name, source, description, metrics, List.of());
    }

    public static ValidationResult of(
            String name, String source, String description,
            List<ValidationMetrics> metrics, List<String> warnings) {
        boolean allPass = metrics.stream().allMatch(ValidationMetrics::passed);
        return new ValidationResult(name, source, description, metrics, warnings, allPass);
    }
}
