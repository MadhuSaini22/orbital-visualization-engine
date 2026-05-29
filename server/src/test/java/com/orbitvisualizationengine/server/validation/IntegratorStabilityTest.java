package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.propagation.numerical.NumericalPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;

/**
 * Validates numerical integrator stability and adaptive step-size behaviour.
 *
 * Tests:
 *   1. No NaN or Infinity in position/velocity over 24 h ISS propagation.
 *   2. Position magnitude stays within LEO altitude band throughout 24 h.
 *   3. Tolerance sweep keeps the J2 energy diagnostic bounded.
 *   4. Tight and loose tolerances remain mutually consistent over 24 h.
 *   5. Long-arc stability: ISS orbit does not numerically explode over 30 days.
 */
class IntegratorStabilityTest {

    private static final double GM = Constants.EGM96_EARTH_MU;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── No NaN / Inf in trajectory ──────────────────────────────────────────────

    @Test
    void noNanOrInfinityInTwentyFourHoursPropagation() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        NumericalPropagator prop = buildPropagator(tle, 1.0, 1e-3);

        AbsoluteDate epoch = tle.getDate();
        int nanCount = 0;

        for (int step = 1; step <= 1440; step++) {   // every 60 s for 24 h
            SpacecraftState s = prop.propagate(epoch.shiftedBy(step * 60.0));
            double[] pos = s.getPVCoordinates().getPosition().toArray();
            double[] vel = s.getPVCoordinates().getVelocity().toArray();
            for (double v : pos) {
                if (Double.isNaN(v) || Double.isInfinite(v)) nanCount++;
            }
            for (double v : vel) {
                if (Double.isNaN(v) || Double.isInfinite(v)) nanCount++;
            }
        }

        System.out.printf(Locale.ROOT,
            "%n=== NaN/Inf Check (24 h, 1440 steps) ===%n" +
            "  NaN/Inf count (must be 0): %d  [%s]%n",
            nanCount, nanCount == 0 ? "PASS" : "FAIL");

        assertFalse(nanCount > 0, "No NaN or Inf must appear in 24 h ISS propagation");
    }

    // ─── Position stays in LEO altitude band ─────────────────────────────────────

    @Test
    void positionMagnitudeStaysWithinLeoBandOverTwentyFourHours() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        NumericalPropagator prop = buildPropagator(tle, 1.0, 1e-3);

        AbsoluteDate epoch = tle.getDate();
        double minPosKm = Double.MAX_VALUE;
        double maxPosKm = 0;
        int outOfBand = 0;

        for (int step = 0; step <= 1440; step++) {
            SpacecraftState s = prop.propagate(epoch.shiftedBy(step * 60.0));
            double posKm = s.getPosition().getNorm() * 1e-3;
            if (posKm < minPosKm) minPosKm = posKm;
            if (posKm > maxPosKm) maxPosKm = posKm;
            if (posKm < ValidationConstants.INTEGRATOR_MIN_POS_KM || posKm > ValidationConstants.INTEGRATOR_MAX_POS_KM) {
                outOfBand++;
            }
        }

        System.out.printf(Locale.ROOT,
            "%n=== LEO Band Check (24 h) ===%n" +
            "  Position range: [%.2f, %.2f] km  band: [%.0f, %.0f] km%n" +
            "  Out-of-band count: %d  [%s]%n",
            minPosKm, maxPosKm,
            ValidationConstants.INTEGRATOR_MIN_POS_KM, ValidationConstants.INTEGRATOR_MAX_POS_KM,
            outOfBand, outOfBand == 0 ? "PASS" : "FAIL");

        assertTrue(outOfBand == 0, String.format(Locale.ROOT,
            "Position must stay in [%.0f, %.0f] km band; %d steps out of band",
            ValidationConstants.INTEGRATOR_MIN_POS_KM, ValidationConstants.INTEGRATOR_MAX_POS_KM, outOfBand));
    }

    // ─── Tolerance settings keep the trajectory physically bounded ───────────────

    @Test
    void toleranceSweepKeepsJ2EnergyDiagnosticBounded() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        double[] tolerances = {10.0, 1.0, 0.1, 0.01};
        double[] energyDrift = new double[tolerances.length];

        double a = ValidationConstants.CONS_A_KM * 1000;
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit initialOrbit = new KeplerianOrbit(
            a, 0.0, Math.toRadians(51.6), 0.0, 0.0, 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);

        System.out.printf(Locale.ROOT,
            "%n=== J2 Energy Diagnostic vs Integration Tolerance ===%n" +
            "  %-12s  %-20s%n", "absTol (m)", "ΔE/E₀ at 24 h");

        for (int i = 0; i < tolerances.length; i++) {
            NumericalPropagator prop = buildJ2PropagatorFromOrbit(initialOrbit, tolerances[i]);
            SpacecraftState s0  = prop.propagate(epoch);
            SpacecraftState s24 = prop.propagate(epoch.shiftedBy(86400.0));

            double e0 = specificEnergy(s0);
            double e1 = specificEnergy(s24);
            energyDrift[i] = Math.abs((e1 - e0) / e0);

            System.out.printf(Locale.ROOT, "  %-12.2f  %-20.6e%n",
                tolerances[i], energyDrift[i]);
        }

        // This diagnostic uses two-body specific energy while the propagated
        // trajectory includes J2. It is therefore a boundedness check, not a
        // monotonic convergence proof for integrator tolerance.
        for (double drift : energyDrift) {
            assertTrue(drift < 5e-3, String.format(Locale.ROOT,
                "J2 two-body energy diagnostic %.6e must remain bounded", drift));
        }
    }

    // ─── Propagation residual grows with tolerance (regression baseline) ─────────

    @Test
    void looseAndTightTolerancesRemainMutuallyConsistent() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch  = tle.getDate();
        AbsoluteDate end24h = epoch.shiftedBy(86400.0);

        NumericalPropagator tight = buildPropagator(tle, 0.01, 1e-9);
        NumericalPropagator loose = buildPropagator(tle, 10.0, 1e-3);

        SpacecraftState tightEnd = tight.propagate(end24h);
        SpacecraftState looseEnd = loose.propagate(end24h);

        double[] posTight = tightEnd.getPosition().toArray();
        double[] posLoose = looseEnd.getPosition().toArray();
        double diffM = norm(subtract(posTight, posLoose));
        double tightRadiusKm = tightEnd.getPosition().getNorm() * 1e-3;
        double looseRadiusKm = looseEnd.getPosition().getNorm() * 1e-3;
        double consistencyLimitM = 100.0;

        System.out.printf(Locale.ROOT,
            "%n=== Tolerance Consistency (tight 0.01 m vs loose 10 m, 24 h) ===%n" +
            "  Position difference: %.3f m  (limit: %.1f m)%n" +
            "  Radius tight/loose: %.3f / %.3f km%n",
            diffM, consistencyLimitM, tightRadiusKm, looseRadiusKm);

        assertTrue(diffM <= consistencyLimitM, String.format(Locale.ROOT,
            "Tight and loose tolerance endpoints differ by %.3f m, above %.1f m",
            diffM, consistencyLimitM));
        assertTrue(tightRadiusKm >= ValidationConstants.INTEGRATOR_MIN_POS_KM
                && tightRadiusKm <= ValidationConstants.INTEGRATOR_MAX_POS_KM,
            "Tight-tolerance endpoint must remain in the LEO radius band");
        assertTrue(looseRadiusKm >= ValidationConstants.INTEGRATOR_MIN_POS_KM
                && looseRadiusKm <= ValidationConstants.INTEGRATOR_MAX_POS_KM,
            "Loose-tolerance endpoint must remain in the LEO radius band");
    }

    // ─── Long-arc numerical stability ────────────────────────────────────────────

    @Test
    void thirtyDayPropagationRemainsNumericallyBounded() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        NumericalPropagator prop = buildPropagator(tle, 1.0, 1e-3);

        AbsoluteDate epoch  = tle.getDate();
        System.out.printf(Locale.ROOT, "%n=== 30-Day Stability ===%n");
        for (int day = 1; day <= 30; day += 5) {
            SpacecraftState s = prop.propagate(epoch.shiftedBy(day * 86400.0));
            double posKm = s.getPosition().getNorm() * 1e-3;
            double velKmps = s.getPVCoordinates().getVelocity().getNorm() * 1e-3;
            boolean sane = !Double.isNaN(posKm) && !Double.isInfinite(posKm)
                && posKm > 6400 && posKm < 7000 && velKmps > 7 && velKmps < 8;
            System.out.printf(Locale.ROOT,
                "  day %2d: |r|=%.2f km  |v|=%.4f km/s  [%s]%n",
                day, posKm, velKmps, sane ? "OK" : "UNSTABLE");
            assertTrue(sane, String.format(Locale.ROOT,
                "ISS trajectory must remain in physical range at day %d (|r|=%.2f km)", day, posKm));
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private static NumericalPropagator buildPropagator(TLE tle, double absTol, double relTol) {
        TLEPropagator seed = TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        CartesianOrbit orbit = new CartesianOrbit(
            seed.getPVCoordinates(epoch, FramesFactory.getEME2000()),
            FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0 = new SpacecraftState(orbit, 420.0);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(0.1, 300.0, absTol, relTol);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);
        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(8, 8)));
        return prop;
    }

    private static NumericalPropagator buildJ2PropagatorFromOrbit(
            KeplerianOrbit orbit, double absTol) {
        CartesianOrbit cartesian = new CartesianOrbit(
            orbit.getPVCoordinates(), orbit.getFrame(), orbit.getDate(), GM);
        SpacecraftState s0 = new SpacecraftState(cartesian);
        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(0.1, 300.0, absTol, absTol * 1e-6);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);
        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(2, 0)));
        return prop;
    }

    private static double specificEnergy(SpacecraftState s) {
        double v2 = s.getPVCoordinates().getVelocity().getNormSq();
        double r  = s.getPVCoordinates().getPosition().getNorm();
        return 0.5 * v2 - GM / r;
    }

    private static double norm(double[] v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static double[] subtract(double[] a, double[] b) {
        return new double[]{a[0]-b[0], a[1]-b[1], a[2]-b[2]};
    }
}
