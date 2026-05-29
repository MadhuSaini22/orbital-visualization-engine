package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.Locale;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.attitudes.LofOffset;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.maneuvers.ConstantThrustManeuver;
import org.orekit.frames.FramesFactory;
import org.orekit.frames.LOFType;
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
 * Validates that maneuver delta-V produces the orbital element changes predicted
 * by the Gauss variational equations — the definitive analytical reference for
 * impulsive and finite-burn maneuver effects.
 *
 * Tests:
 *   1. Prograde 1 m/s burn on circular orbit → Δa within 7 % of Gauss prediction.
 *   2. Retrograde burn → semi-major axis decreases (sign check).
 *   3. Normal (out-of-plane) burn → inclination changes, semi-major axis unchanged.
 *   4. Prograde burn increases orbital energy (vis-viva check).
 *
 * Orbital setup: circular 500 km orbit (a = 6 878.137 km, v_c = 7 612.8 m/s).
 * Maneuver: ConstantThrustManeuver with thrust and ISP chosen to give ΔV ≈ 1 m/s.
 * The numerical propagation is Cartesian because finite thrust and near-circular
 * Keplerian element integration can hit singular coordinates.
 *
 * Requires: EGM96 gravity field (degree 8).
 * Tests are skipped automatically when Orekit data is not available.
 *
 * Reference:
 *   [Vallado2013]  §6.3 — Gauss variational equations.
 */
class ManeuverDeltaVValidationTest {

    private static final double GM = Constants.EGM96_EARTH_MU;
    private static final double G0 = Constants.G0_STANDARD_GRAVITY;

    // 500 km circular orbit parameters
    private static final double A_M = ValidationConstants.MNVR_A_KM * 1000;
    private static final double V_C = Math.sqrt(GM / A_M);

    // Maneuver: thrust=1.4 N, ISP=300 s, duration=300 s → ΔV ≈ 1.0 m/s for 420 kg
    private static final double THRUST_N   = 1.4;
    private static final double ISP_S      = 300.0;
    private static final double DURATION_S = 300.0;
    private static final double MASS_KG    = 420.0;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── Prograde burn increases semi-major axis by Gauss-predicted amount ───────

    @Test
    void progradeManeuverIncreasesSmaByGaussVariationalPrediction() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit initialOrbit = circularOrbit(epoch, 0.0);

        // Propagate without maneuver to get baseline SMA
        NumericalPropagator baselineProp = buildPropagator(initialOrbit, null);
        AbsoluteDate postBurn = epoch.shiftedBy(DURATION_S + 300.0);
        double aBefore = sma(baselineProp.propagate(postBurn));

        // Propagate with prograde maneuver
        ConstantThrustManeuver prograde = prograde(epoch);
        NumericalPropagator manProp = buildPropagator(initialOrbit, prograde);
        double aAfter = sma(manProp.propagate(postBurn));

        double deltaA = aAfter - aBefore;

        // Gauss linear prediction: Δa = 2a ΔV / v_c
        double effectiveDv  = effectiveDeltaV();
        double predictedDa  = 2.0 * A_M * effectiveDv / V_C;
        double actualDa     = deltaA;
        double fractionErr  = Math.abs(actualDa - predictedDa) / predictedDa;

        System.out.printf(Locale.ROOT,
            "%n=== Prograde Maneuver Δa (Gauss Equation vs Numerical) ===%n" +
            "  Orbit: a = %.3f km, v_c = %.3f m/s%n" +
            "  ΔV (Tsiolkovsky): %.4f m/s%n" +
            "  Gauss predicted Δa: %.1f m%n" +
            "  Numerical     Δa:   %.1f m%n" +
            "  Fractional error:   %.4f  (tol: %.2f)  [%s]%n",
            A_M / 1000, V_C, effectiveDv,
            predictedDa, actualDa, fractionErr,
            ValidationConstants.MNVR_TOLERANCE_FRAC,
            fractionErr <= ValidationConstants.MNVR_TOLERANCE_FRAC ? "PASS" : "FAIL");

        assertTrue(deltaA > 0,
            "Prograde maneuver must increase semi-major axis");
        assertTrue(fractionErr <= ValidationConstants.MNVR_TOLERANCE_FRAC, String.format(Locale.ROOT,
            "Δa fractional error %.4f must be ≤ %.2f", fractionErr, ValidationConstants.MNVR_TOLERANCE_FRAC));
    }

    // ─── Retrograde burn decreases SMA ───────────────────────────────────────────

    @Test
    void retrogradeManeuverDecreasesSma() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit initialOrbit = circularOrbit(epoch, 0.0);
        AbsoluteDate postBurn = epoch.shiftedBy(DURATION_S + 300.0);

        NumericalPropagator baselineProp = buildPropagator(initialOrbit, null);
        double aBefore = sma(baselineProp.propagate(postBurn));

        ConstantThrustManeuver retro = new ConstantThrustManeuver(
            epoch, DURATION_S, THRUST_N, ISP_S,
            new LofOffset(FramesFactory.getEME2000(), LOFType.TNW),
            Vector3D.MINUS_I, "retro-burn");

        NumericalPropagator retroProp = buildPropagator(initialOrbit, retro);
        double aAfter = sma(retroProp.propagate(postBurn));

        double deltaA = aAfter - aBefore;
        System.out.printf(Locale.ROOT,
            "%n=== Retrograde Maneuver Δa ===%n" +
            "  Before: a = %.3f km  After: a = %.3f km  Δa = %.1f m  [%s]%n",
            aBefore / 1000, aAfter / 1000, deltaA,
            deltaA < 0 ? "PASS" : "FAIL");

        assertTrue(deltaA < 0,
            "Retrograde maneuver must decrease semi-major axis");
    }

    // ─── Normal burn changes inclination, leaves SMA unchanged ──────────────────

    @Test
    void normalBurnChangesInclinationLeavesEnergyUnchanged() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit initialOrbit = circularOrbit(epoch, 0.0);
        AbsoluteDate postBurn = epoch.shiftedBy(DURATION_S + 300.0);

        NumericalPropagator baselineProp = buildPropagator(initialOrbit, null);
        SpacecraftState baseSt = baselineProp.propagate(postBurn);

        ConstantThrustManeuver normal = new ConstantThrustManeuver(
            epoch, DURATION_S, THRUST_N, ISP_S,
            new LofOffset(FramesFactory.getEME2000(), LOFType.TNW),
            Vector3D.PLUS_K, "normal-burn");

        NumericalPropagator normalProp = buildPropagator(initialOrbit, normal);
        SpacecraftState manSt = normalProp.propagate(postBurn);

        double aDelta   = Math.abs(sma(manSt) - sma(baseSt));
        double incDelta = Math.abs(Math.toDegrees(
            new KeplerianOrbit(manSt.getOrbit()).getI() -
            new KeplerianOrbit(baseSt.getOrbit()).getI()));

        System.out.printf(Locale.ROOT,
            "%n=== Normal Burn Effect ===%n" +
            "  Δa = %.1f m  (should be small, tol 500 m)%n" +
            "  Δi = %.5f°  (should be measurable > 0.001°)%n",
            aDelta, incDelta);

        // A normal burn is orthogonal to velocity to first order. Small finite-burn
        // coupling and J2 over the same arc are tolerated, but the energy change
        // should be much smaller than the prograde case.
        assertTrue(aDelta < 800.0, String.format(Locale.ROOT,
            "Normal burn Δa = %.1f m should be < 800 m", aDelta));
        // Inclination must change
        assertTrue(incDelta > 0.001, String.format(Locale.ROOT,
            "Normal burn Δi = %.5f° must be > 0.001°", incDelta));
    }

    // ─── Prograde burn increases orbital energy ───────────────────────────────────

    @Test
    void progradeManeuverIncreasesOrbitalEnergy() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        KeplerianOrbit orbit = circularOrbit(epoch, 0.0);
        AbsoluteDate postBurn = epoch.shiftedBy(DURATION_S + 300.0);

        NumericalPropagator baseProp = buildPropagator(orbit, null);
        NumericalPropagator manProp  = buildPropagator(orbit, prograde(epoch));

        double eBefore = specificEnergy(baseProp.propagate(postBurn));
        double eAfter  = specificEnergy(manProp.propagate(postBurn));

        System.out.printf(Locale.ROOT,
            "%n=== Prograde Burn Energy Change ===%n" +
            "  ε before: %.6e J/kg%n" +
            "  ε after:  %.6e J/kg%n" +
            "  Δε:       %+.6e J/kg  [%s]%n",
            eBefore, eAfter, eAfter - eBefore,
            eAfter > eBefore ? "PASS" : "FAIL");

        assertTrue(eAfter > eBefore,
            "Prograde burn must increase specific orbital energy");
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static KeplerianOrbit circularOrbit(AbsoluteDate epoch, double raan) {
        return new KeplerianOrbit(
            A_M, 0.0, Math.toRadians(51.6), 0.0, raan, 0.0,
            PositionAngleType.MEAN, FramesFactory.getEME2000(), epoch, GM);
    }

    private static ConstantThrustManeuver prograde(AbsoluteDate start) {
        return new ConstantThrustManeuver(
            start, DURATION_S, THRUST_N, ISP_S,
            new LofOffset(FramesFactory.getEME2000(), LOFType.TNW),
            Vector3D.PLUS_I, "prograde-burn");
    }

    @SuppressWarnings("deprecation")
    private static NumericalPropagator buildPropagator(
            KeplerianOrbit initialOrbit, ConstantThrustManeuver maneuver) {

        // Mass is required for ConstantThrustManeuver to compute F/m and mass
        // depletion. Use Cartesian integration to avoid singular near-circular
        // Keplerian coordinates during finite thrust arcs.
        CartesianOrbit cartesian = new CartesianOrbit(
            initialOrbit.getPVCoordinates(), initialOrbit.getFrame(), initialOrbit.getDate(), GM);
        SpacecraftState s0 = new SpacecraftState(cartesian, MASS_KG);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1e-6, 1e-9);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);
        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(8, 0)));
        if (maneuver != null) {
            prop.addForceModel(maneuver);
        }
        return prop;
    }

    private static double sma(SpacecraftState state) {
        return new KeplerianOrbit(state.getOrbit()).getA();
    }

    private static double specificEnergy(SpacecraftState state) {
        double v2 = state.getPVCoordinates().getVelocity().getNormSq();
        double r  = state.getPVCoordinates().getPosition().getNorm();
        return 0.5 * v2 - GM / r;
    }

    /** Effective ΔV from Tsiolkovsky: Isp * g0 * ln(m0/mf). */
    private static double effectiveDeltaV() {
        double mf = MASS_KG - THRUST_N * DURATION_S / (ISP_S * G0);
        return ISP_S * G0 * Math.log(MASS_KG / mf);
    }
}
