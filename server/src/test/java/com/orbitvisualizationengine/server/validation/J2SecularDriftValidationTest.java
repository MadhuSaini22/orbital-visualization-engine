package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.Locale;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.frames.FramesFactory;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.OrbitType;
import org.orekit.orbits.PositionAngleType;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.numerical.NumericalPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;

/**
 * Validates secular RAAN and argument-of-perigee drift rates from a J2-only
 * numerical propagator against Brouwer (1959) first-order analytical secular
 * theory.
 *
 * The numerical values are fitted from multi-day samples taken once per orbit.
 * This intentionally avoids comparing one short-term osculating element delta
 * directly to a mean secular rate, because J2 short-period terms can dominate
 * the instantaneous argument of perigee and node.
 *
 * Required external data: EGM96 (or equivalent) gravity field file.
 * Tests are skipped automatically when no Orekit data directory is found.
 *
 * References:
 *   [Brouwer1959]  Brouwer, D. AJ, 64, 378 (1959).
 *   [Vallado2013]  Vallado, §9.3.
 */
class J2SecularDriftValidationTest {

    private static final double J2 = 1.0826257e-3;
    private static final double GM = Constants.EGM96_EARTH_MU;
    private static final double RE = Constants.WGS84_EARTH_EQUATORIAL_RADIUS;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── RAAN secular drift vs Brouwer ──────────────────────────────────────────

    @Test
    void raanDriftMatchesBrouwerSecularEquation_ISS() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Orekit gravity field file required — set OREKIT_DATA_PATH");

        double a = ValidationConstants.J2_A_KM * 1000;
        double e = ValidationConstants.J2_ECC;
        double i = Math.toRadians(ValidationConstants.J2_INC_DEG);

        double analytical = brouwerRaanDrift(a, e, i);
        double numerical  = measureRaanDrift(a, e, i, 0.0, 0.0, 0.0, 7);

        double residual = numerical - analytical;
        double tolerance = ValidationConstants.J2_TOLERANCE_DEG_DAY;

        printDriftResult("RAAN", "ISS-like orbit", a, e, i, analytical, numerical, residual, tolerance);

        assertEquals(analytical, numerical, tolerance,
            String.format(Locale.ROOT,
                "RAAN drift must agree with Brouwer secular equation within %.3f °/day", tolerance));
    }

    // ─── AoP secular drift vs Brouwer ───────────────────────────────────────────

    @Test
    void aopDriftMatchesBrouwerSecularEquation_ModerateEccentricity() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Orekit gravity field file required — set OREKIT_DATA_PATH");

        // Use a moderately eccentric, higher orbit for AoP: first-order Brouwer
        // secular theory is a mean-element approximation, and low-LEO osculating
        // perigee is dominated by short-period J2 terms even after fitting.
        double a = 12_000.0e3;
        // AoP is poorly conditioned for nearly circular orbits. Use a modest
        // eccentricity so the argument of perigee is physically meaningful.
        double e = 0.01;
        double i = Math.toRadians(ValidationConstants.J2_INC_DEG);

        double analytical = brouwerAopDrift(a, e, i);
        double numerical  = measureAopDrift(a, e, i, Math.toRadians(30.0), 0.0, 0.0, 30);

        double residual = numerical - analytical;
        double tolerance = ValidationConstants.J2_TOLERANCE_DEG_DAY;

        printDriftResult("AoP", "moderate-eccentricity orbit", a, e, i, analytical, numerical, residual, tolerance);

        assertEquals(analytical, numerical, tolerance,
            String.format(Locale.ROOT,
                "AoP drift must agree with Brouwer secular equation within %.3f °/day", tolerance));
    }

    // ─── Sun-synchronous orbit RAAN drift ───────────────────────────────────────

    @Test
    void sunSynchronousRaanDriftMatchesSunPrecessionRate() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Orekit gravity field file required — set OREKIT_DATA_PATH");

        double a = ValidationConstants.SSO_A_KM * 1000;
        double e = 0.001;
        double i = Math.toRadians(ValidationConstants.SSO_INC_DEG);

        double analytical = brouwerRaanDrift(a, e, i);
        double numerical  = measureRaanDrift(a, e, i, 0.0, 0.0, 0.0, 7);
        double target     = ValidationConstants.SSO_RAAN_TARGET_DEG_DAY;
        double tolerance  = ValidationConstants.SSO_RAAN_TOL_DEG_DAY;

        System.out.printf(Locale.ROOT,
            "%n=== Sun-Synchronous RAAN Drift ===%n" +
            "  a = %.1f km, i = %.2f°%n" +
            "  Brouwer analytical: %+.5f °/day%n" +
            "  Numerical (J2):     %+.5f °/day%n" +
            "  Target SSO:         %+.5f °/day  (Earth mean motion)%n" +
            "  Residual vs target: %+.6f °/day  (tol ±%.3f)%n",
            a / 1000, Math.toDegrees(i),
            analytical, numerical, target, numerical - target, tolerance);

        assertEquals(target, numerical, tolerance,
            "SSO RAAN drift must match Earth's mean angular motion (+0.9856 °/day)");
        assertEquals(analytical, numerical, 0.02,
            "Brouwer formula and numerical must agree to 0.02 °/day for SSO");
    }

    // ─── Frozen orbit (critical inclination AoP is null) ───────────────────────

    @Test
    void criticalInclinationHasNearZeroAopDrift() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Orekit gravity field file required — set OREKIT_DATA_PATH");

        // At critical inclination i* = arccos(1/√5) ≈ 63.43°, dω/dt = 0 (Brouwer)
        double iCrit = Math.acos(1.0 / Math.sqrt(5.0));
        double a = 7000.0e3;
        double e = 0.05;

        double analytical = brouwerAopDrift(a, e, iCrit);
        double numerical  = measureAopDrift(a, e, iCrit, Math.toRadians(45.0), 0.0, 0.0, 10);

        System.out.printf(Locale.ROOT,
            "%n=== Critical Inclination AoP Drift ===%n" +
            "  i_crit = %.6f° = arccos(1/√5)%n" +
            "  Brouwer dω/dt: %+.8f °/day  (should be ~0)%n" +
            "  Numerical:     %+.8f °/day%n",
            Math.toDegrees(iCrit), analytical, numerical);

        assertEquals(0.0, analytical, 0.001,
            "Brouwer AoP drift must be ~0 at critical inclination");
        assertEquals(0.0, numerical, 0.1,
            "Numerical AoP drift must be near zero at critical inclination (tol 0.1 °/day)");
    }

    // ─── Position error growth — J2 vs Keplerian (divergence curve) ─────────────

    @Test
    void j2PerturbationCausesGrowingPositionErrorVsKeplerian() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Orekit gravity field file required — set OREKIT_DATA_PATH");

        double a = ValidationConstants.J2_A_KM * 1000;
        double e = ValidationConstants.J2_ECC;
        double i = Math.toRadians(ValidationConstants.J2_INC_DEG);
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit initialOrbit = new KeplerianOrbit(
            a, e, i, 0.0, 0.0, 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        NumericalPropagator j2Prop = buildJ2Propagator(initialOrbit);
        org.orekit.propagation.analytical.KeplerianPropagator kepProp =
            new org.orekit.propagation.analytical.KeplerianPropagator(initialOrbit);

        System.out.printf(Locale.ROOT, "%n=== J2 vs Keplerian Position Divergence (24 h) ===%n");
        double prevError = 0;
        for (int hour = 0; hour <= 24; hour += 3) {
            AbsoluteDate t = epoch.shiftedBy(hour * 3600.0);
            double[] j2Pos  = j2Prop.propagate(t).getPVCoordinates().getPosition().toArray();
            double[] kepPos = kepProp.getPVCoordinates(t, FramesFactory.getEME2000()).getPosition().toArray();
            double err = norm(subtract(j2Pos, kepPos));
            System.out.printf(Locale.ROOT, "  t+%02dh: divergence = %10.1f m%n", hour, err);
            if (hour > 0) {
                assertTrue(err >= prevError * 0.5,
                    "J2 vs Keplerian divergence should generally grow over time (hour=" + hour + ")");
            }
            prevError = err;
        }

        AbsoluteDate end = epoch.shiftedBy(86400.0);
        double[] j2End  = j2Prop.propagate(end).getPVCoordinates().getPosition().toArray();
        double[] kepEnd = kepProp.getPVCoordinates(end, FramesFactory.getEME2000()).getPosition().toArray();
        double finalErr = norm(subtract(j2End, kepEnd));

        System.out.printf(Locale.ROOT, "  Final 24 h divergence: %.1f m%n", finalErr);
        assertTrue(finalErr > 1000.0,
            "J2 vs Keplerian divergence must exceed 1 km after 24 h");
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Brouwer secular RAAN drift rate (°/day).
     * dΩ/dt = −3n J2 (Rₑ/p)² cos i / 2
     */
    private static double brouwerRaanDrift(double a, double e, double i) {
        double n = Math.sqrt(GM / (a * a * a));
        double p = a * (1 - e * e);
        double rateRad = -1.5 * n * J2 * (RE / p) * (RE / p) * Math.cos(i);
        return Math.toDegrees(rateRad) * 86400;
    }

    /**
     * Brouwer secular AoP drift rate (°/day).
     * dω/dt = 3n J2 (Rₑ/p)² (5 cos²i − 1) / 4
     */
    private static double brouwerAopDrift(double a, double e, double i) {
        double n = Math.sqrt(GM / (a * a * a));
        double p = a * (1 - e * e);
        double cos2i = Math.cos(i) * Math.cos(i);
        double rateRad = 0.75 * n * J2 * (RE / p) * (RE / p) * (5 * cos2i - 1);
        return Math.toDegrees(rateRad) * 86400;
    }

    private static double measureRaanDrift(
            double a, double e, double inc, double aop, double raan, double ma, int days) {
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit orbit0 = new KeplerianOrbit(
            a, e, inc, aop, raan, ma,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);
        NumericalPropagator prop = buildJ2Propagator(orbit0);

        return fittedAngularRateDegPerDay(prop, epoch, orbit0.getKeplerianPeriod(), days, true);
    }

    private static double measureAopDrift(
            double a, double e, double inc, double aop, double raan, double ma, int days) {
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit orbit0 = new KeplerianOrbit(
            a, e, inc, aop, raan, ma,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);
        NumericalPropagator prop = buildJ2Propagator(orbit0);

        return fittedAngularRateDegPerDay(prop, epoch, orbit0.getKeplerianPeriod(), days, false);
    }

    private static NumericalPropagator buildJ2Propagator(KeplerianOrbit initialOrbit) {
        CartesianOrbit cartesian = new CartesianOrbit(
            initialOrbit.getPVCoordinates(), initialOrbit.getFrame(), initialOrbit.getDate(), GM);
        SpacecraftState s0 = new SpacecraftState(cartesian);
        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1e-9, 1e-9);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);
        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(2, 0)));
        return prop;
    }

    private static double raanDeg(SpacecraftState s) {
        return Math.toDegrees(new KeplerianOrbit(s.getOrbit()).getRightAscensionOfAscendingNode());
    }

    private static double aopDeg(SpacecraftState s) {
        return Math.toDegrees(new KeplerianOrbit(s.getOrbit()).getPerigeeArgument());
    }

    private static double fittedAngularRateDegPerDay(
            NumericalPropagator prop, AbsoluteDate epoch, double sampleStepSeconds, int days, boolean raan) {
        int sampleCount = Math.max(8, (int) Math.floor(days * 86400.0 / sampleStepSeconds));
        double[] timesDays = new double[sampleCount + 1];
        double[] unwrappedDeg = new double[sampleCount + 1];

        double previous = raan ? raanDeg(prop.propagate(epoch)) : aopDeg(prop.propagate(epoch));
        double cumulative = previous;
        timesDays[0] = 0.0;
        unwrappedDeg[0] = cumulative;

        for (int k = 1; k <= sampleCount; k++) {
            double dt = k * sampleStepSeconds;
            if (dt > days * 86400.0) {
                dt = days * 86400.0;
            }
            SpacecraftState state = prop.propagate(epoch.shiftedBy(dt));
            double current = raan ? raanDeg(state) : aopDeg(state);
            cumulative += normalizeDeg(current - previous);
            previous = current;
            timesDays[k] = dt / 86400.0;
            unwrappedDeg[k] = cumulative;
        }
        return linearSlope(timesDays, unwrappedDeg);
    }

    private static double linearSlope(double[] x, double[] y) {
        double meanX = 0.0;
        double meanY = 0.0;
        for (int i = 0; i < x.length; i++) {
            meanX += x[i];
            meanY += y[i];
        }
        meanX /= x.length;
        meanY /= y.length;
        double numerator = 0.0;
        double denominator = 0.0;
        for (int i = 0; i < x.length; i++) {
            double dx = x[i] - meanX;
            numerator += dx * (y[i] - meanY);
            denominator += dx * dx;
        }
        return numerator / denominator;
    }

    private static double normalizeDeg(double deg) {
        return Math.toDegrees(Math.atan2(Math.sin(Math.toRadians(deg)), Math.cos(Math.toRadians(deg))));
    }

    private static void printDriftResult(
            String element, String label, double a, double e, double i,
            double analytical, double numerical, double residual, double tol) {
        System.out.printf(Locale.ROOT,
            "%n=== %s Secular Drift — %s (Brouwer 1959 vs Numerical) ===%n" +
            "  Orbit: a = %.1f km, e = %.4f, i = %.3f°%n" +
            "  Brouwer analytical: %+.5f °/day%n" +
            "  Numerical (J2):     %+.5f °/day%n" +
            "  Residual:           %+.6f °/day  (tol ±%.3f °/day)  [%s]%n",
            element, label, a / 1000, e, Math.toDegrees(i),
            analytical, numerical, residual, tol,
            Math.abs(residual) <= tol ? "PASS" : "FAIL");
    }

    private static double norm(double[] v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static double[] subtract(double[] a, double[] b) {
        return new double[]{a[0]-b[0], a[1]-b[1], a[2]-b[2]};
    }

    @SuppressWarnings("SameParameterValue")
    private static void assertTrue(boolean condition, String msg) {
        if (!condition) {
            throw new AssertionError(msg);
        }
    }
}
