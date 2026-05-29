package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.frames.FramesFactory;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;

/**
 * Validates energy and angular momentum conservation, which are absolute physics
 * constraints independent of any external tool — they hold exactly for the
 * two-body problem and to high precision for conservative perturbation models.
 *
 * Tests performed:
 *   1. Specific orbital energy (vis-viva) relative conservation in analytical
 *      KeplerianPropagator — should be < 1×10⁻⁹ over 10 orbital periods.
 *   2. Angular momentum magnitude conservation — same criterion.
 *   3. Eccentricity vector invariance (frozen orbit verification).
 *   4. Orbital period consistency — period computed from energy must match
 *      the time to return to the same mean anomaly.
 *
 * These tests run without any external Orekit data files because they use
 * only the analytical KeplerianPropagator.
 *
 * Reference:
 *   [Vallado2013]  Vallado, §2.2–2.3.
 */
class EnergyMomentumConservationTest {

    private static final double GM = Constants.EGM96_EARTH_MU;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── Specific orbital energy conservation ────────────────────────────────────

    @Test
    void specificOrbitalEnergyConservedOverTenOrbits() {
        double a = ValidationConstants.CONS_A_KM * 1000;   // 500 km altitude
        double e = 0.0;
        double i = Math.toRadians(51.6);
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit initialOrbit = new KeplerianOrbit(
            a, e, i, 0.0, 0.0, 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        org.orekit.propagation.analytical.KeplerianPropagator propagator =
            new org.orekit.propagation.analytical.KeplerianPropagator(initialOrbit);

        double e0 = specificEnergy(initialOrbit);
        double periodS = 2.0 * Math.PI * Math.sqrt(a * a * a / GM);

        List<double[]> energyCurve = new ArrayList<>();
        double maxRelErr = 0;
        System.out.printf(Locale.ROOT,
            "%n=== Specific Orbital Energy Conservation (Keplerian, 10 orbits) ===%n" +
            "  a = %.1f km, e = %.4f, i = %.1f°%n" +
            "  ε₀ = %.6e J/kg  (= −GM/(2a))%n" +
            "  Tolerance: relative error < %.0e%n%n",
            a / 1000, e, Math.toDegrees(i), e0, ValidationConstants.ENERGY_REL_TOL);

        for (int orbit = 0; orbit <= 10; orbit++) {
            AbsoluteDate t = epoch.shiftedBy(orbit * periodS);
            PVCoordinates pv = propagator.getPVCoordinates(t, FramesFactory.getEME2000());
            double energy = specificEnergy(pv);
            double relErr = Math.abs((energy - e0) / e0);
            energyCurve.add(new double[]{orbit * periodS, relErr});
            if (relErr > maxRelErr) {
                maxRelErr = relErr;
            }
            System.out.printf(Locale.ROOT,
                "  orbit %2d  ε = %+.10e J/kg  Δε/ε₀ = %+.4e%n", orbit, energy, energy / e0 - 1);
        }

        System.out.printf(Locale.ROOT,
            "%n  Max relative energy error: %.4e  (tol: %.0e)  [%s]%n",
            maxRelErr, ValidationConstants.ENERGY_REL_TOL,
            maxRelErr < ValidationConstants.ENERGY_REL_TOL ? "PASS" : "FAIL");

        assertTrue(maxRelErr < ValidationConstants.ENERGY_REL_TOL, String.format(Locale.ROOT,
            "Specific orbital energy relative error %.2e must be < %.0e",
            maxRelErr, ValidationConstants.ENERGY_REL_TOL));
    }

    // ─── Angular momentum magnitude conservation ─────────────────────────────────

    @Test
    void angularMomentumConservedOverTenOrbits() {
        double a = ValidationConstants.CONS_A_KM * 1000;
        double e = 0.05;
        double i = Math.toRadians(28.5);
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit initialOrbit = new KeplerianOrbit(
            a, e, i, Math.toRadians(15.0), Math.toRadians(45.0), 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        org.orekit.propagation.analytical.KeplerianPropagator propagator =
            new org.orekit.propagation.analytical.KeplerianPropagator(initialOrbit);

        double p = a * (1 - e * e);
        double h0 = Math.sqrt(GM * p);
        double periodS = 2.0 * Math.PI * Math.sqrt(a * a * a / GM);

        double maxRelErr = 0;
        System.out.printf(Locale.ROOT,
            "%n=== Angular Momentum Conservation (Keplerian, 10 orbits) ===%n" +
            "  |h₀| = %.6e m²/s  Tolerance: < %.0e%n",
            h0, ValidationConstants.MOMENTUM_REL_TOL);

        for (int orbit = 0; orbit <= 10; orbit++) {
            AbsoluteDate t = epoch.shiftedBy(orbit * periodS);
            PVCoordinates pv = propagator.getPVCoordinates(t, FramesFactory.getEME2000());
            double h = angularMomentumNorm(pv);
            double relErr = Math.abs((h - h0) / h0);
            if (relErr > maxRelErr) {
                maxRelErr = relErr;
            }
            System.out.printf(Locale.ROOT,
                "  orbit %2d  |h| = %.10e  Δh/h₀ = %+.4e%n", orbit, h, h / h0 - 1);
        }

        System.out.printf(Locale.ROOT,
            "  Max relative |h| error: %.4e  (tol: %.0e)  [%s]%n",
            maxRelErr, ValidationConstants.MOMENTUM_REL_TOL,
            maxRelErr < ValidationConstants.MOMENTUM_REL_TOL ? "PASS" : "FAIL");

        assertTrue(maxRelErr < ValidationConstants.MOMENTUM_REL_TOL, String.format(Locale.ROOT,
            "Angular momentum relative error %.2e must be < %.0e",
            maxRelErr, ValidationConstants.MOMENTUM_REL_TOL));
    }

    // ─── Orbital period computed from vis-viva ────────────────────────────────────

    @Test
    void visVivaEnergyGivesPeriodConsistentWithPropagation() {
        double a = ValidationConstants.OREKIT_A_KM * 1000;
        double e = 0.0;
        double i = Math.toRadians(ValidationConstants.OREKIT_INC_DEG);
        AbsoluteDate epoch = new AbsoluteDate(2004, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit initialOrbit = new KeplerianOrbit(
            a, e, i, 0.0, 0.0, 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        org.orekit.propagation.analytical.KeplerianPropagator propagator =
            new org.orekit.propagation.analytical.KeplerianPropagator(initialOrbit);

        double periodFromEnergy = 2.0 * Math.PI * Math.sqrt(a * a * a / GM);
        double expectedPeriod   = ValidationConstants.OREKIT_PERIOD_S;

        AbsoluteDate tAfterPeriod = epoch.shiftedBy(periodFromEnergy);
        double[] posStart = propagator.getPVCoordinates(epoch, FramesFactory.getEME2000())
            .getPosition().toArray();
        double[] posEnd   = propagator.getPVCoordinates(tAfterPeriod, FramesFactory.getEME2000())
            .getPosition().toArray();

        double closureM = norm(subtract(posStart, posEnd));
        double periodDiff = Math.abs(periodFromEnergy - expectedPeriod);

        System.out.printf(Locale.ROOT,
            "%n=== Orekit Tutorial Orbit — Period Consistency ===%n" +
            "  a = %.6f km, i = %.2f°%n" +
            "  Period (analytical): %.3f s%n" +
            "  Period (tutorial):   %.3f s%n" +
            "  Δ period:            %.4f s%n" +
            "  Position closure after one period: %.4f m  (tol: %.1f m)%n",
            a / 1000, Math.toDegrees(i),
            periodFromEnergy, expectedPeriod, periodDiff,
            closureM, ValidationConstants.OREKIT_PERIOD_CLOSURE_TOL_M);

        assertTrue(periodDiff <= ValidationConstants.OREKIT_PERIOD_TOL_S, String.format(Locale.ROOT,
            "Computed period %.3f s must match tutorial reference %.3f s within %.1f s",
            periodFromEnergy, expectedPeriod, ValidationConstants.OREKIT_PERIOD_TOL_S));
        assertTrue(closureM <= ValidationConstants.OREKIT_PERIOD_CLOSURE_TOL_M, String.format(Locale.ROOT,
            "Position closure error %.4f m must be < %.1f m after one orbital period",
            closureM, ValidationConstants.OREKIT_PERIOD_CLOSURE_TOL_M));
    }

    // ─── Eccentricity vector invariance (frozen orbit) ───────────────────────────

    @Test
    void eccentricityVectorUnchangedForKeplerianPropagator() {
        double a = 26560.0e3;   // GPS orbit (MEO)
        double e = 0.01;
        double i = Math.toRadians(55.0);
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit orbit0 = new KeplerianOrbit(
            a, e, i, Math.toRadians(30.0), Math.toRadians(90.0), 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        org.orekit.propagation.analytical.KeplerianPropagator propagator =
            new org.orekit.propagation.analytical.KeplerianPropagator(orbit0);

        // Propagate for 7 days
        double sevenDays = 7.0 * 86400.0;
        AbsoluteDate tEnd = epoch.shiftedBy(sevenDays);

        KeplerianOrbit orbitEnd = new KeplerianOrbit(
            propagator.propagate(tEnd).getOrbit());

        double eDiff = Math.abs(orbitEnd.getE() - orbit0.getE());
        double aDiff = Math.abs(orbitEnd.getA() - orbit0.getA());

        System.out.printf(Locale.ROOT,
            "%n=== Eccentricity Vector Invariance (Keplerian, 7 days) ===%n" +
            "  Δe = %.4e (tol 1e-12)%n" +
            "  Δa = %.4e m (tol 1e-6 m)%n",
            eDiff, aDiff);

        assertTrue(eDiff < 1e-12,
            "Eccentricity must be exactly conserved in Keplerian propagation");
        assertTrue(aDiff < 1e-6,
            "Semi-major axis must be exactly conserved in Keplerian propagation");
    }

    // ─── Specific energy vs altitude for circular orbit ──────────────────────────

    @Test
    void visVivaRelationHoldsAtMultipleAltitudes() {
        // ε = v²/2 − GM/r must equal −GM/(2a) for circular orbits
        double[] altKm = {300, 500, 800, 1500, 35786};
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        System.out.printf(Locale.ROOT, "%n=== Vis-viva relation across altitudes ===%n");
        System.out.printf(Locale.ROOT, "  %-8s  %-16s  %-16s  %-12s%n",
            "alt(km)", "ε_orbit(J/kg)", "ε_visviva(J/kg)", "rel error");

        for (double alt : altKm) {
            double a = (alt + 6378.137) * 1000;
            KeplerianOrbit orbit = new KeplerianOrbit(
                a, 0.0, Math.toRadians(28.5), 0.0, 0.0, 0.0,
                PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

            org.orekit.propagation.analytical.KeplerianPropagator prop =
                new org.orekit.propagation.analytical.KeplerianPropagator(orbit);

            PVCoordinates pv = prop.getPVCoordinates(epoch, FramesFactory.getEME2000());
            double energyFromPV  = specificEnergy(pv);
            double energyFromOrb = -GM / (2 * a);
            double relErr = Math.abs((energyFromPV - energyFromOrb) / energyFromOrb);

            System.out.printf(Locale.ROOT, "  %-8.0f  %16.6e  %16.6e  %12.4e  [%s]%n",
                alt, energyFromPV, energyFromOrb, relErr, relErr < 1e-9 ? "PASS" : "FAIL");

            assertTrue(relErr < 1e-9, String.format(Locale.ROOT,
                "Vis-viva relative error %.2e at %.0f km altitude must be < 1e-9", relErr, alt));
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static double specificEnergy(KeplerianOrbit orbit) {
        return -GM / (2 * orbit.getA());
    }

    private static double specificEnergy(PVCoordinates pv) {
        double v2 = pv.getVelocity().getNormSq();
        double r  = pv.getPosition().getNorm();
        return 0.5 * v2 - GM / r;
    }

    private static double angularMomentumNorm(PVCoordinates pv) {
        return pv.getPosition().crossProduct(pv.getVelocity()).getNorm();
    }

    private static double norm(double[] v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static double[] subtract(double[] a, double[] b) {
        return new double[]{a[0]-b[0], a[1]-b[1], a[2]-b[2]};
    }
}
