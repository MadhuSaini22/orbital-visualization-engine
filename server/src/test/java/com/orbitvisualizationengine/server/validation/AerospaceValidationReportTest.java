package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Verifies report aggregation and metric pass/fail semantics.
 *
 * Physics validation belongs to the owning suites. This test intentionally uses
 * small deterministic report inputs so it does not duplicate propagation checks
 * or relabel internal consistency checks as external validation.
 */
class AerospaceValidationReportTest {

    @Test
    void reportAggregatesPassingAtMostAndAtLeastMetrics() {
        List<ValidationResult> results = List.of(
            ValidationResult.of(
                "Report bounded residual aggregation",
                "Internal report formatter",
                "Verifies error <= tolerance metric handling",
                List.of(ValidationMetrics.single("position residual", "m", 0.25, 1.0))),
            ValidationResult.of(
                "Report activation threshold aggregation",
                "Internal report formatter",
                "Verifies value >= threshold metric handling",
                List.of(ValidationMetrics.thresholdAtLeast(
                    "force-model divergence", "m", 12.0, 10.0))));

        AerospaceValidationReport report = new AerospaceValidationReport(
            "Aerospace Validation Report Aggregation",
            Instant.parse("2026-05-29T00:00:00Z"),
            "report-only deterministic input",
            "not applicable",
            AerospaceValidationReport.FidelityLevel.PLANNING,
            results,
            List.of("data-dependent suites are reported by their owning tests"),
            Map.of());

        report.print();

        assertTrue(report.allPassed(), "Report should pass when every metric satisfies its rule");
        assertEquals(results.size(), report.passCount(),
            "Pass count should equal result count when all report inputs pass");
    }
}
