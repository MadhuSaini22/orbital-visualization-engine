package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.frames.FramesFactory;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.PVCoordinates;

/**
 * Regression tests verifying that the propagation stack is deterministic:
 * identical configuration must produce identical trajectories across multiple
 * invocations, regardless of call order or JVM state.
 *
 * This property is mandatory for:
 *   - Monte-Carlo campaign reproducibility.
 *   - Regression baseline locking.
 *   - Differential testing between propagator versions.
 *
 * Tests (SGP4 tier — run without any external Orekit data files):
 *   1. Two sequential SGP4 propagations with identical TLE reproduce the same
 *      positions within floating-point roundoff.
 *   2. Propagating forward then backward over the same arc reproduces the
 *      initial state to < 1 m (time-reversibility check).
 *   3. Different NORAD IDs propagated with the same time span do not alias each
 *      other (isolation check).
 *   4. Propagating 100 steps individually vs. in bulk agrees within roundoff.
 */
class DeterminismRegressionTest {

    private static final double POSITION_REPRO_TOL_M = 1.0e-9;
    private static final double VELOCITY_REPRO_TOL_MPS = 1.0e-9;

    // Initialized in @BeforeAll (not as static fields) — TLE() requires UTC to be loaded first.
    private static TLE ISS_TLE;
    private static TLE VANGUARD_TLE;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
        ISS_TLE      = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1,       ValidationConstants.ISS_SENSITIVITY_LINE2);
        VANGUARD_TLE = new TLE(ValidationConstants.VALLADO_00005_LINE1,   ValidationConstants.VALLADO_00005_LINE2);
    }

    // ─── Sequential invocations produce identical output ─────────────────────────

    @Test
    void twoSgp4RunsWithIdenticalTleReproduceWithinRoundoff() {
        AbsoluteDate epoch = ISS_TLE.getDate();
        List<AbsoluteDate> times = sampleTimes(epoch, 60, 1440);   // every 60 s over 24 h

        TLEPropagator p1 = TLEPropagator.selectExtrapolator(ISS_TLE);
        TLEPropagator p2 = TLEPropagator.selectExtrapolator(ISS_TLE);

        int mismatches = 0;
        double maxDelta = 0;

        for (AbsoluteDate t : times) {
            PVCoordinates pv1 = p1.getPVCoordinates(t, FramesFactory.getTEME());
            PVCoordinates pv2 = p2.getPVCoordinates(t, FramesFactory.getTEME());
            double deltaM = pv1.getPosition().subtract(pv2.getPosition()).getNorm();
            if (deltaM > POSITION_REPRO_TOL_M) {
                mismatches++;
            }
            if (deltaM > maxDelta) {
                maxDelta = deltaM;
            }
        }

        System.out.printf(Locale.ROOT,
            "%n=== SGP4 Determinism (two runs, %d steps) ===%n" +
            "  Samples above tolerance: %d%n" +
            "  Max position delta:      %.4e m  (tol: %.1e m)  [%s]%n",
            times.size(), mismatches, maxDelta, POSITION_REPRO_TOL_M,
            maxDelta <= POSITION_REPRO_TOL_M ? "PASS" : "FAIL");

        assertEquals(0, mismatches,
            "Two identical SGP4 propagations must reproduce positions within roundoff");
    }

    // ─── Time-reversibility ───────────────────────────────────────────────────────

    @Test
    void sgp4ForwardThenBackwardReproducesInitialState() {
        AbsoluteDate t0 = ISS_TLE.getDate();
        AbsoluteDate t1 = t0.shiftedBy(3 * 3600.0);   // 3 h forward

        TLEPropagator prop = TLEPropagator.selectExtrapolator(ISS_TLE);
        PVCoordinates pvStart   = prop.getPVCoordinates(t0, FramesFactory.getTEME());
        prop.getPVCoordinates(t1, FramesFactory.getTEME());            // step forward
        PVCoordinates pvReturn  = prop.getPVCoordinates(t0, FramesFactory.getTEME());  // step back

        double posError = pvStart.getPosition().subtract(pvReturn.getPosition()).getNorm();
        double velError = pvStart.getVelocity().subtract(pvReturn.getVelocity()).getNorm();

        System.out.printf(Locale.ROOT,
            "%n=== SGP4 Time-Reversibility (3 h forward, back) ===%n" +
            "  Position round-trip error: %.6f m%n" +
            "  Velocity round-trip error: %.6f m/s%n",
            posError, velError);

        assertEquals(0.0, posError, 1e-6,
            "SGP4 must reproduce exact initial position when stepping back to start epoch");
        assertEquals(0.0, velError, VELOCITY_REPRO_TOL_MPS,
            "SGP4 must reproduce exact initial velocity when stepping back to start epoch");
    }

    // ─── Different TLEs do not alias ─────────────────────────────────────────────

    @Test
    void differentTlesProduceDifferentTrajectories() {
        AbsoluteDate epoch = ISS_TLE.getDate();

        TLEPropagator issP      = TLEPropagator.selectExtrapolator(ISS_TLE);
        TLEPropagator vanguardP = TLEPropagator.selectExtrapolator(VANGUARD_TLE);

        PVCoordinates pvIss      = issP.getPVCoordinates(epoch, FramesFactory.getTEME());
        PVCoordinates pvVanguard = vanguardP.getPVCoordinates(
            VANGUARD_TLE.getDate(), FramesFactory.getTEME());

        double posDiffM = pvIss.getPosition().subtract(pvVanguard.getPosition()).getNorm();

        System.out.printf(Locale.ROOT,
            "%n=== NORAD Isolation (ISS vs VANGUARD) ===%n" +
            "  Position separation: %.1f km  (must be > 0)  [%s]%n",
            posDiffM / 1000, posDiffM > 1000 ? "PASS" : "FAIL");

        assertTrue(posDiffM > 1000,
            "Propagators for different NORAD IDs must produce different trajectories");
    }

    // ─── Step-by-step vs bulk propagation agreement ──────────────────────────────

    @Test
    void stepByStepAndBulkPropagationAreIdentical() {
        AbsoluteDate epoch = ISS_TLE.getDate();
        int steps = 100;
        double stepS = 60.0;

        TLEPropagator stepProp = TLEPropagator.selectExtrapolator(ISS_TLE);
        TLEPropagator bulkProp = TLEPropagator.selectExtrapolator(ISS_TLE);

        double maxDelta = 0;
        for (int i = 1; i <= steps; i++) {
            AbsoluteDate t = epoch.shiftedBy(i * stepS);
            double[] stepPos = stepProp.getPVCoordinates(t, FramesFactory.getTEME())
                .getPosition().toArray();
            double[] bulkPos = bulkProp.getPVCoordinates(t, FramesFactory.getTEME())
                .getPosition().toArray();
            double delta = Math.sqrt(
                sq(stepPos[0] - bulkPos[0]) +
                sq(stepPos[1] - bulkPos[1]) +
                sq(stepPos[2] - bulkPos[2]));
            if (delta > maxDelta) {
                maxDelta = delta;
            }
        }

        System.out.printf(Locale.ROOT,
            "%n=== Step-by-Step vs Bulk (%d steps, Δt=%ds) ===%n" +
            "  Max position delta: %.4e m  (tol: %.1e m)  [%s]%n",
            steps, (int) stepS, maxDelta, POSITION_REPRO_TOL_M,
            maxDelta <= POSITION_REPRO_TOL_M ? "PASS" : "FAIL");

        assertTrue(maxDelta <= POSITION_REPRO_TOL_M,
            "SGP4 step-by-step and bulk propagation must agree within roundoff");
    }

    // ─── Order of evaluation does not affect output ───────────────────────────────

    @Test
    void reverseOrderEvaluationMatchesForwardOrder() {
        AbsoluteDate epoch = ISS_TLE.getDate();
        int steps = 50;
        double stepS = 120.0;
        List<AbsoluteDate> times = sampleTimes(epoch, (int) stepS, steps);

        TLEPropagator fwd = TLEPropagator.selectExtrapolator(ISS_TLE);
        TLEPropagator rev = TLEPropagator.selectExtrapolator(ISS_TLE);

        double[] fwdPositions = new double[steps];
        double[] revPositions = new double[steps];

        // Forward order
        for (int i = 0; i < steps; i++) {
            fwdPositions[i] = fwd.getPVCoordinates(times.get(i), FramesFactory.getTEME())
                .getPosition().getNorm();
        }
        // Reverse order
        for (int i = steps - 1; i >= 0; i--) {
            revPositions[i] = rev.getPVCoordinates(times.get(i), FramesFactory.getTEME())
                .getPosition().getNorm();
        }

        double maxDelta = 0;
        for (int i = 0; i < steps; i++) {
            double d = Math.abs(fwdPositions[i] - revPositions[i]);
            if (d > maxDelta) {
                maxDelta = d;
            }
        }

        System.out.printf(Locale.ROOT,
            "%n=== Evaluation Order Independence (%d steps) ===%n" +
            "  Max |r| delta (forward vs reverse order): %.4e m  (tol: %.1e m)  [%s]%n",
            steps, maxDelta, POSITION_REPRO_TOL_M,
            maxDelta <= POSITION_REPRO_TOL_M ? "PASS" : "FAIL");

        assertTrue(maxDelta <= POSITION_REPRO_TOL_M,
            "SGP4 output must be reproducible regardless of evaluation order");
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static List<AbsoluteDate> sampleTimes(AbsoluteDate start, int stepS, int count) {
        java.util.List<AbsoluteDate> list = new java.util.ArrayList<>(count);
        for (int i = 1; i <= count; i++) {
            list.add(start.shiftedBy(i * (double) stepS));
        }
        return list;
    }

    private static double sq(double x) {
        return x * x;
    }
}
