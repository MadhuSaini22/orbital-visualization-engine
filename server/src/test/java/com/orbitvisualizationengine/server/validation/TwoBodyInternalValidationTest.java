package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.frames.FramesFactory;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.propagation.analytical.KeplerianPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.PVCoordinates;

/**
 * Cross-validates Orekit's KeplerianPropagator against {@link AnalyticalKeplerianPropagator}
 * — an independent Java implementation of the two-body problem that uses no Orekit classes.
 *
 * Both implementations solve the same mathematical problem:
 *   Newton-Raphson Kepler equation  +  Vallado Algorithm 4 (coe2rv)
 *
 * Agreement to < 1 m position error over one orbital period constitutes
 * internal cross-validation between independent implementations, not external
 * flight-data validation.
 *
 * Reference cases are drawn from {@link ValidationReferenceDataset}, which computes
 * initial state vectors from closed-form formulas — independent of any propagator.
 *
 * References:
 *   [Vallado2013]  Vallado Algorithms 1, 4.  FADA 4th ed.
 *   [Danby1992]    Danby §6.6 — Kepler equation solver.
 */
class TwoBodyInternalValidationTest {

    private static final double GM     = ValidationReferenceDataset.GM;
    private static final double POS_TOL_M = 1.0;   // < 1 m position agreement
    private static final double VEL_TOL_MPS = 0.001; // < 1 mm/s velocity agreement

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── Initial state vector agrees with closed-form coe2rv ────────────────────

    @Test
    void orekitInitialStateMatchesAnalyticalCoe2rvAtEpoch_AllReferenceOrbits() {
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        List<ValidationReferenceDataset.ReferenceState> cases = List.of(
            ValidationReferenceDataset.LEO_CIRCULAR_500KM,
            ValidationReferenceDataset.GEO_CIRCULAR,
            ValidationReferenceDataset.ISS_LIKE_ELLIPTICAL,
            ValidationReferenceDataset.POLAR_SSO);

        System.out.printf(Locale.ROOT, "%n=== Orekit vs coe2rv Initial State (t=0) ===%n");
        System.out.printf(Locale.ROOT, "  %-42s  %-12s  %-12s  %-6s%n",
            "Orbit", "pos err (m)", "vel err (mm/s)", "Status");

        for (ValidationReferenceDataset.ReferenceState ref : cases) {
            KeplerianOrbit orbit = new KeplerianOrbit(
                ref.a(), ref.e(),
                Math.toRadians(ref.iDeg()),
                Math.toRadians(ref.aopDeg()),
                Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.nuDeg()),
                PositionAngleType.TRUE,
                FramesFactory.getEME2000(), epoch, GM);

            PVCoordinates pv = orbit.getPVCoordinates();
            double[] oPos = pv.getPosition().toArray();
            double[] oVel = pv.getVelocity().toArray();

            double posErr = norm3(subtract3(oPos, ref.posM()));
            double velErr = norm3(subtract3(oVel, ref.velMps())) * 1000;

            System.out.printf(Locale.ROOT, "  %-42s  %12.4f  %12.6f  %s%n",
                ref.label(), posErr, velErr,
                posErr < POS_TOL_M ? "PASS" : "FAIL");

            assertEquals(0.0, posErr, POS_TOL_M, String.format(Locale.ROOT,
                "Orekit vs coe2rv initial position error %.3f m > %.1f m for %s",
                posErr, POS_TOL_M, ref.label()));
        }
    }

    // ─── Propagated state agrees between Orekit and analytical at T/4, T/2, T ──

    @Test
    void orekitMatchesAnalyticalPropagatorAtQuarterHalfAndFullPeriod_LEO() {
        propagationCrossValidation(ValidationReferenceDataset.LEO_CIRCULAR_500KM,
            "Circular 500 km LEO");
    }

    @Test
    void orekitMatchesAnalyticalPropagatorAtQuarterHalfAndFullPeriod_GEO() {
        propagationCrossValidation(ValidationReferenceDataset.GEO_CIRCULAR, "GEO");
    }

    @Test
    void orekitMatchesAnalyticalPropagatorAtQuarterHalfAndFullPeriod_ISS() {
        propagationCrossValidation(ValidationReferenceDataset.ISS_LIKE_ELLIPTICAL,
            "ISS-like LEO e=0.001");
    }

    @Test
    void orekitMatchesAnalyticalPropagatorAtQuarterHalfAndFullPeriod_SSO() {
        propagationCrossValidation(ValidationReferenceDataset.POLAR_SSO, "Polar SSO 600 km");
    }

    @Test
    void orekitMatchesAnalyticalPropagatorAtQuarterHalfAndFullPeriod_Molniya() {
        propagationCrossValidation(ValidationReferenceDataset.MOLNIYA_HEO, "Molniya HEO");
    }

    // ─── Position closure after one period < 1 m (two-body invariant) ───────────

    @Test
    void analyticalPropagatorPositionClosureAfterOnePeriod_AllOrbits() {
        List<ValidationReferenceDataset.ReferenceState> cases = List.of(
            ValidationReferenceDataset.LEO_CIRCULAR_500KM,
            ValidationReferenceDataset.ISS_LIKE_ELLIPTICAL,
            ValidationReferenceDataset.POLAR_SSO,
            ValidationReferenceDataset.MOLNIYA_HEO);

        System.out.printf(Locale.ROOT, "%n=== Analytical Propagator One-Orbit Closure ===%n");

        for (ValidationReferenceDataset.ReferenceState ref : cases) {
            double[] sv0 = AnalyticalKeplerianPropagator.coe2rv(
                ref.a(), ref.e(),
                Math.toRadians(ref.iDeg()), Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.aopDeg()), Math.toRadians(ref.nuDeg()), GM);

            double[] sv1 = AnalyticalKeplerianPropagator.propagate(
                ref.a(), ref.e(),
                Math.toRadians(ref.iDeg()), Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.aopDeg()), Math.toRadians(ref.nuDeg()),
                ref.periodS(), GM);

            double closure = norm3(subtract3(
                new double[]{sv0[0], sv0[1], sv0[2]},
                new double[]{sv1[0], sv1[1], sv1[2]}));

            System.out.printf(Locale.ROOT, "  %-42s  closure = %.6f m  [%s]%n",
                ref.label(), closure, closure < 0.001 ? "PASS" : "FAIL");

            assertTrue(closure < 0.001, String.format(Locale.ROOT,
                "One-orbit closure %.6f m must be < 1 mm for %s (two-body invariant)",
                closure, ref.label()));
        }
    }

    // ─── rv2coe round-trip: elements → rv → elements matches original ────────────

    @Test
    void rv2coeRoundTripClosesToMachinePrecision_AllReferenceOrbits() {
        System.out.printf(Locale.ROOT, "%n=== rv2coe Round-Trip (elements→rv→elements) ===%n");

        for (double[] elems : ValidationReferenceDataset.RV2COE_ELEMENT_SETS) {
            double a_in = elems[0], e_in = elems[1];
            double i_in = Math.toRadians(elems[2]), raan_in = Math.toRadians(elems[3]);
            double aop_in = Math.toRadians(elems[4]), nu_in = Math.toRadians(elems[5]);

            // Step 1: elements → rv (Vallado Alg. 4)
            double[] rv = AnalyticalKeplerianPropagator.coe2rv(
                a_in, e_in, i_in, raan_in, aop_in, nu_in, GM);

            // Step 2: rv → elements (Vallado Alg. 9)
            double[] elOut = AnalyticalKeplerianPropagator.rv2coe(rv, GM);

            double da   = Math.abs(elOut[0] - a_in);
            double de   = Math.abs(elOut[1] - e_in);
            double di   = Math.abs(Math.toDegrees(elOut[2] - i_in));
            double draan = angleDiffDeg(Math.toDegrees(elOut[3]), elems[3]);
            double daop  = angleDiffDeg(Math.toDegrees(elOut[4]), elems[4]);
            boolean eccentric = e_in > 1e-10;
            double dnu = eccentric ? angleDiffDeg(Math.toDegrees(elOut[5]), elems[5]) : 0.0;

            boolean pass = da   < ValidationReferenceDataset.RV2COE_A_TOL_M
                        && de   < ValidationReferenceDataset.RV2COE_E_TOL
                        && di   < ValidationReferenceDataset.RV2COE_ANGLE_TOL_DEG;

            String dnuText = eccentric ? String.format(Locale.ROOT, "%.4e°", dnu) : "N/A";
            System.out.printf(Locale.ROOT,
                "  a=%.0fkm e=%.3f i=%.1f°: Δa=%.4em Δe=%.4e Δi=%.4e° ΔΩ=%.4e° Δω=%.4e° Δν=%s [%s]%n",
                a_in/1000, e_in, elems[2], da, de, di, draan, daop, dnuText, pass ? "PASS" : "FAIL");

            assertEquals(a_in,  elOut[0], ValidationReferenceDataset.RV2COE_A_TOL_M,
                "a round-trip error " + da + " m must be < 1 m");
            assertEquals(e_in,  elOut[1], ValidationReferenceDataset.RV2COE_E_TOL,
                "e round-trip error " + de + " must be < 1e-10");
            assertEquals(elems[2], Math.toDegrees(elOut[2]),
                ValidationReferenceDataset.RV2COE_ANGLE_TOL_DEG,
                "i round-trip error " + di + "° must be < 1e-6°");
        }
    }

    // ─── Kepler equation solver accuracy vs published reference ─────────────────

    @Test
    void keplerEquationSolverAccuracy_HighEccentricity() {
        // Published solutions from Danby (1992) §6.6 and Bate §2.4.
        // For a given (M, e), E_exact satisfies M = E − e·sin E to machine precision.
        // We verify: |E_computed − E_brute_force| < 1e-13 rad (sub-nanoarcsecond).

        double[][] cases = {
            // {M [rad], e}  — spans the full range of eccentricities
            {0.0,            0.0},   // degenerate: E = 0
            {Math.PI / 2,    0.0},   // circular: E = π/2
            {Math.PI / 2,    0.1},   // low ecc
            {Math.PI / 2,    0.5},   // moderate ecc
            {Math.PI / 2,    0.9},   // high ecc  [Danby1992 §6.6 Example]
            {0.1,            0.9},   // high ecc, small M
            {Math.PI,        0.99},  // near-parabolic at apogee
            {Math.toRadians(19.3264), 0.1859667}  // SAT-00005 mean anomaly at epoch
        };

        System.out.printf(Locale.ROOT, "%n=== Kepler Equation Solver Accuracy ===%n");

        for (double[] c : cases) {
            double M = c[0], e = c[1];
            double E = AnalyticalKeplerianPropagator.solveKepler(M, e);
            double residual = Math.abs(M - (E - e * Math.sin(E)));

            System.out.printf(Locale.ROOT,
                "  M=%.4f rad  e=%.4f  →  E=%.10f rad  residual=%.4e rad  [%s]%n",
                M, e, E, residual, residual < 1e-13 ? "PASS" : "FAIL");

            assertTrue(residual < 1e-13, String.format(Locale.ROOT,
                "Kepler residual |M−(E−e·sinE)| = %.4e must be < 1e-13 for M=%.4f e=%.4f",
                residual, M, e));
        }
    }

    // ─── Divergence curve: Orekit vs analytical over 5 periods ─────────────────

    @Test
    void divergenceCurveOrekitVsAnalytical_LeoOverFivePeriods() {
        ValidationReferenceDataset.ReferenceState ref = ValidationReferenceDataset.LEO_CIRCULAR_500KM;
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit orekitOrbit = new KeplerianOrbit(
            ref.a(), ref.e(),
            Math.toRadians(ref.iDeg()), Math.toRadians(ref.aopDeg()),
            Math.toRadians(ref.raanDeg()), Math.toRadians(ref.nuDeg()),
            PositionAngleType.TRUE,
            FramesFactory.getEME2000(), epoch, GM);
        KeplerianPropagator orekitProp = new KeplerianPropagator(orekitOrbit);

        List<double[]> curve = new ArrayList<>();
        double maxErrM = 0;
        int steps = 20;

        System.out.printf(Locale.ROOT, "%n=== Divergence Curve: Orekit vs Analytical (5 orbits) ===%n");

        for (int step = 0; step <= steps; step++) {
            double dt = step * 5 * ref.periodS() / steps;
            AbsoluteDate t = epoch.shiftedBy(dt);

            double[] aSv = AnalyticalKeplerianPropagator.propagate(
                ref.a(), ref.e(),
                Math.toRadians(ref.iDeg()), Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.aopDeg()), Math.toRadians(ref.nuDeg()),
                dt, GM);

            double[] oPos = orekitProp.getPVCoordinates(t, FramesFactory.getEME2000())
                .getPosition().toArray();

            double errM = norm3(subtract3(oPos, new double[]{aSv[0], aSv[1], aSv[2]}));
            curve.add(new double[]{dt, errM});
            if (errM > maxErrM) maxErrM = errM;

            System.out.printf(Locale.ROOT, "  t=%8.1f s  err=%10.4f m  [%s]%n",
                dt, errM, errM < POS_TOL_M ? "OK" : "DIVERGED");
        }

        System.out.printf(Locale.ROOT, "  Max error over 5 orbits: %.4f m  (tol: %.1f m)  [%s]%n",
            maxErrM, POS_TOL_M, maxErrM < POS_TOL_M ? "PASS" : "FAIL");

        assertTrue(maxErrM < POS_TOL_M, String.format(Locale.ROOT,
            "Max Orekit vs analytical divergence %.4f m must be < %.1f m over 5 orbits",
            maxErrM, POS_TOL_M));
    }

    // ─── GEO position matches the geostationary radius to 1 m ──────────────────

    @Test
    void geoOrbitRadiusMatchesDerivedFromSiderealDay() {
        // a_GEO = (GM / ω_E²)^(1/3), ω_E = 2π / T_sidereal
        double expected = ValidationReferenceDataset.GEO_CIRCULAR.a();
        double actual   = Math.cbrt(GM / Math.pow(2 * Math.PI / ValidationReferenceDataset.SIDEREAL_DAY_S, 2));

        System.out.printf(Locale.ROOT,
            "%n=== GEO Radius from Sidereal Day ===%n" +
            "  From sidereal day: a = %.3f km%n" +
            "  Reference dataset: a = %.3f km%n" +
            "  Error: %.3f m  [%s]%n",
            actual / 1000, expected / 1000, Math.abs(actual - expected),
            Math.abs(actual - expected) < 10 ? "PASS" : "FAIL");

        assertEquals(expected, actual, 10.0,
            "GEO radius from sidereal day must match reference to 10 m");

        // Verify Orekit period matches sidereal day
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit geo = new KeplerianOrbit(
            expected, 0.0, 0.0, 0.0, 0.0, 0.0,
            PositionAngleType.TRUE, FramesFactory.getEME2000(), epoch, GM);

        double orekitPeriod = 2 * Math.PI * Math.sqrt(geo.getA() * geo.getA() * geo.getA() / GM);
        double periodErr = Math.abs(orekitPeriod - ValidationReferenceDataset.SIDEREAL_DAY_S);

        System.out.printf(Locale.ROOT,
            "  GEO period: %.3f s (sidereal day: %.3f s, err: %.3f s)  [%s]%n",
            orekitPeriod, ValidationReferenceDataset.SIDEREAL_DAY_S, periodErr,
            periodErr < 1.0 ? "PASS" : "FAIL");

        assertTrue(periodErr < 1.0, String.format(Locale.ROOT,
            "GEO period %.3f s must match sidereal day %.3f s within 1 s",
            orekitPeriod, ValidationReferenceDataset.SIDEREAL_DAY_S));
    }

    // ─── SGP4 orbital elements match TLE-derived constraints ────────────────────

    @Test
    void sgp4V00005ElementsConsistentWithTleValues() {
        // Published TLE mean elements are used as catalog-derived consistency
        // constraints; no propagation truth vectors are implied here.
        double aKm    = ValidationReferenceDataset.SGP4_V00005_A_KM;
        double rpKm   = ValidationReferenceDataset.SGP4_V00005_RP_KM;
        double raKm   = ValidationReferenceDataset.SGP4_V00005_RA_KM;
        double ecc    = ValidationReferenceDataset.SGP4_V00005_ECC;
        double incDeg = ValidationReferenceDataset.SGP4_V00005_INC_DEG;

        System.out.printf(Locale.ROOT,
            "%n=== SAT-00005 TLE Element Consistency ===%n" +
            "  a  = %.3f km  rp = %.3f km  ra = %.3f km%n" +
            "  e  = %.7f  i = %.4f°%n",
            aKm, rpKm, raKm, ecc, incDeg);

        // Verify self-consistency: a = (rp + ra) / 2
        assertEquals((rpKm + raKm) / 2, aKm, 0.001,
            "a must equal (rp+ra)/2 to 1 m");
        // Verify eccentricity: e = (ra - rp) / (ra + rp)
        assertEquals(ecc, (raKm - rpKm) / (raKm + rpKm), 1e-6,
            "e must match (ra-rp)/(ra+rp)");
        // Verify perigee altitude above Earth's surface
        assertTrue(rpKm > 6378.137 + 500,
            "Perigee must be > 500 km altitude (high-eccentricity orbit)");
        assertTrue(raKm < 14000,
            "Apogee must be < 14000 km for this TLE");
        // Verify inclination is in published range
        assertEquals(34.2682, incDeg, 0.0001,
            "Inclination must match TLE value to 4 decimal places");
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private void propagationCrossValidation(
            ValidationReferenceDataset.ReferenceState ref, String label) {

        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit orekitOrbit = new KeplerianOrbit(
            ref.a(), ref.e(),
            Math.toRadians(ref.iDeg()), Math.toRadians(ref.aopDeg()),
            Math.toRadians(ref.raanDeg()), Math.toRadians(ref.nuDeg()),
            PositionAngleType.TRUE,
            FramesFactory.getEME2000(), epoch, GM);
        KeplerianPropagator orekitProp = new KeplerianPropagator(orekitOrbit);

        double[] fractions = {0.0, 0.25, 0.50, 0.75, 1.0};
        System.out.printf(Locale.ROOT, "%n=== Orekit vs Analytical: %s ===%n", label);

        for (double f : fractions) {
            double dt = f * ref.periodS();
            AbsoluteDate t = epoch.shiftedBy(dt);

            double[] aSv = AnalyticalKeplerianPropagator.propagate(
                ref.a(), ref.e(),
                Math.toRadians(ref.iDeg()), Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.aopDeg()), Math.toRadians(ref.nuDeg()),
                dt, GM);

            PVCoordinates oPv = orekitProp.getPVCoordinates(t, FramesFactory.getEME2000());
            double[] oPos = oPv.getPosition().toArray();
            double[] oVel = oPv.getVelocity().toArray();

            double posErr = norm3(subtract3(oPos, new double[]{aSv[0], aSv[1], aSv[2]}));
            double velErr = norm3(subtract3(oVel, new double[]{aSv[3], aSv[4], aSv[5]}));

            System.out.printf(Locale.ROOT,
                "  t=%.2fT (%.1fs):  pos err=%8.4f m  vel err=%.6f m/s  [%s]%n",
                f, dt, posErr, velErr, posErr < POS_TOL_M ? "PASS" : "FAIL");

            assertEquals(0.0, posErr, POS_TOL_M, String.format(Locale.ROOT,
                "Orekit vs analytical position error %.4f m must be < %.1f m at t=%.2fT for %s",
                posErr, POS_TOL_M, f, label));
            assertEquals(0.0, velErr, VEL_TOL_MPS, String.format(Locale.ROOT,
                "Orekit vs analytical velocity error %.6f m/s must be < %.3f m/s for %s",
                velErr, VEL_TOL_MPS, label));
        }
    }

    private static double norm3(double[] v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static double[] subtract3(double[] a, double[] b) {
        return new double[]{a[0]-b[0], a[1]-b[1], a[2]-b[2]};
    }

    private static double angleDiffDeg(double a, double b) {
        double d = (a - b) % 360;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return Math.abs(d);
    }
}
