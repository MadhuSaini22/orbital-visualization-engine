package com.orbitvisualizationengine.server.validation;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Comprehensive aerospace validation report produced by
 * {@link AerospaceValidationReportTest}. Covers all validation suites, fidelity
 * classification, numerical stability warnings, and force contribution breakdown.
 *
 * Fidelity classification criteria for this validation harness:
 *   ENGINEERING      — physics checks and force-model sensitivity pass with Orekit data
 *   PLANNING         — core checks pass, data-dependent suites skipped
 *   CONCEPTUAL       — one or more core suites fail
 */
public record AerospaceValidationReport(
    String title,
    Instant generatedAt,
    String propagatorConfig,
    String integratorConfig,
    FidelityLevel fidelityLevel,
    List<ValidationResult> results,
    List<String> numericalWarnings,
    Map<String, Double> forceContributionPercent
) {

    public enum FidelityLevel {
        ENGINEERING    ("Orekit-data force models active; physics checks pass"),
        PLANNING       ("core checks pass; some data-dependent suites skipped"),
        CONCEPTUAL     ("one or more core validation suites failed");

        public final String description;

        FidelityLevel(String description) {
            this.description = description;
        }
    }

    public boolean allPassed() {
        return results.stream().allMatch(ValidationResult::passed);
    }

    public long passCount() {
        return results.stream().filter(ValidationResult::passed).count();
    }

    public void print() {
        String hr = "═".repeat(78);
        String divider = "─".repeat(78);
        System.out.println();
        System.out.println("╔" + hr + "╗");
        System.out.printf(Locale.ROOT, "║  %-74s  ║%n", title);
        System.out.printf(Locale.ROOT, "║  Generated : %-62s  ║%n", generatedAt);
        System.out.printf(Locale.ROOT, "║  Fidelity  : %-10s  %s  ║%n",
            fidelityLevel, fidelityLevel.description.substring(0,
                Math.min(fidelityLevel.description.length(), 54)));
        System.out.println("╚" + hr + "╝");
        System.out.println();

        System.out.println("Propagator : " + propagatorConfig);
        System.out.println("Integrator : " + integratorConfig);
        System.out.println();

        if (!forceContributionPercent.isEmpty()) {
            System.out.println("Force contributions at representative epoch:");
            forceContributionPercent.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .forEach(e -> System.out.printf(Locale.ROOT,
                    "  %-40s %6.3f%%%n", e.getKey(), e.getValue()));
            System.out.println();
        }

        if (!numericalWarnings.isEmpty()) {
            System.out.println("Numerical warnings:");
            numericalWarnings.forEach(w -> System.out.println("  ⚠  " + w));
            System.out.println();
        }

        System.out.printf(Locale.ROOT, "Results: %d / %d passed%n", passCount(), results.size());
        System.out.println(divider);

        for (ValidationResult r : results) {
            String status = r.passed() ? "✓ PASS" : "✗ FAIL";
            System.out.printf(Locale.ROOT, "[%s]  %s%n", status, r.testName());
            System.out.printf(Locale.ROOT, "        Source : %s%n", r.referenceSource());
            System.out.printf(Locale.ROOT, "        Desc   : %s%n", r.description());
            for (ValidationMetrics m : r.metrics()) {
                System.out.println(m.summary());
                if (m.divergenceCurve().size() > 1) {
                    double t0 = m.divergenceCurve().get(0)[0];
                    double e0 = m.divergenceCurve().get(0)[1];
                    double tN = m.divergenceCurve().getLast()[0];
                    double eN = m.divergenceCurve().getLast()[1];
                    System.out.printf(Locale.ROOT,
                        "          Divergence curve: t=%.0f s → %.4f %s  …  t=%.0f s → %.4f %s%n",
                        t0, e0, m.unit(), tN, eN, m.unit());
                }
            }
            r.warnings().forEach(w -> System.out.println("        ⚠  " + w));
            System.out.println();
        }

        System.out.println(divider);
        System.out.println(allPassed()
            ? "ALL VALIDATION SUITES PASSED  ✓"
            : "SOME VALIDATION SUITES FAILED  ✗  — see individual metrics above");
        System.out.println();
    }
}
