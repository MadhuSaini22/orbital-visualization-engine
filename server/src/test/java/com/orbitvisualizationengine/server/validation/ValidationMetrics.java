package com.orbitvisualizationengine.server.validation;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Aggregated error metrics for one validation observable (e.g. position error, RAAN drift).
 * Captures RMS, max, and mean error against a known tolerance, plus a
 * time-series divergence curve suitable for residual plots.
 */
public record ValidationMetrics(
    String name,
    String unit,
    double rmsError,
    double maxError,
    double meanError,
    double tolerance,
    boolean passed,
    List<double[]> divergenceCurve
) {
    public enum PassRule {
        AT_MOST,
        AT_LEAST
    }

    /**
     * Computes metrics from a pre-computed error array and matching time stamps.
     *
     * @param name          human-readable metric label
     * @param unit          physical unit (e.g. "m", "deg/day", "J/kg")
     * @param errors        signed error samples (absolute value is used internally)
     * @param timesSeconds  time stamp for each error sample (null to omit curve)
     * @param tolerance     pass/fail threshold applied to the RMS error
     */
    public static ValidationMetrics compute(
            String name, String unit,
            double[] errors, double[] timesSeconds,
            double tolerance) {
        return compute(name, unit, errors, timesSeconds, tolerance, PassRule.AT_MOST);
    }

    public static ValidationMetrics compute(
            String name, String unit,
            double[] errors, double[] timesSeconds,
            double tolerance, PassRule passRule) {

        if (errors.length == 0) {
            return new ValidationMetrics(name, unit, 0, 0, 0, tolerance, true, List.of());
        }

        double sumSq = 0, sumAbs = 0, max = 0;
        List<double[]> curve = new ArrayList<>();
        for (int i = 0; i < errors.length; i++) {
            double e = Math.abs(errors[i]);
            sumSq += e * e;
            sumAbs += e;
            if (e > max) {
                max = e;
            }
            if (timesSeconds != null && i < timesSeconds.length) {
                curve.add(new double[]{timesSeconds[i], e});
            }
        }
        double rms = Math.sqrt(sumSq / errors.length);
        double mean = sumAbs / errors.length;
        boolean passed = passRule == PassRule.AT_LEAST ? rms >= tolerance : rms <= tolerance;
        return new ValidationMetrics(name, unit, rms, max, mean, tolerance,
            passed, List.copyOf(curve));
    }

    /** Single-point metric (no time series). */
    public static ValidationMetrics single(
            String name, String unit, double error, double tolerance) {
        return compute(name, unit, new double[]{error}, null, tolerance);
    }

    /** Single-point threshold metric where the value must be at least threshold. */
    public static ValidationMetrics thresholdAtLeast(
            String name, String unit, double value, double threshold) {
        return compute(name, unit, new double[]{value}, null, threshold, PassRule.AT_LEAST);
    }

    public String summary() {
        String status = passed ? "PASS" : "FAIL";
        return String.format(Locale.ROOT,
            "  %-44s  RMS=%12.4f  MAX=%12.4f  tol=%12.4f  %s  [%s]",
            name, rmsError, maxError, tolerance, unit, status);
    }
}
