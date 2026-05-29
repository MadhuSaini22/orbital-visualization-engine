package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.forces.drag.DragForce;
import org.orekit.forces.drag.IsotropicDrag;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.frames.FramesFactory;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.OrbitType;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.numerical.NumericalPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;

/**
 * Validates that atmospheric drag produces measurable altitude decay consistent
 * with NRLMSISE00 atmospheric density and the satellite's ballistic coefficient.
 *
 * Tests:
 *   1. Drag produces lower semi-major axis than a matched no-drag propagation.
 *   2. Drag reduces specific orbital energy over the 24 h arc.
 *   3. No-drag propagation conserves semi-major axis over the same arc.
 *   4. Higher drag area causes faster semi-major-axis loss than lower area.
 *
 * Requires: NRLMSISE00 space-weather data and EGM96 gravity field.
 * Tests are skipped automatically when Orekit data is not available.
 *
 * Reference:
 *   [Vallado2013]  §8.6.  Ballistic coefficient and atmospheric density models.
 */
class DragDecayValidationTest {

    private static final double GM = Constants.EGM96_EARTH_MU;
    private static final double RE = Constants.WGS84_EARTH_EQUATORIAL_RADIUS;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── Drag lowers semi-major axis against a matched no-drag case ─────────────

    @Test
    void dragProducesSemiMajorAxisLossAgainstMatchedNoDragCase() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "NRLMSISE00 space-weather data required — set OREKIT_DATA_PATH");

        // Use ISS-representative orbit (~415 km)
        TLE tle = new org.orekit.propagation.analytical.tle.TLE(
            ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);

        NumericalPropagator withDrag = buildDragPropagator(tle, 20.0, 2.2, true);
        NumericalPropagator noDrag = buildDragPropagator(tle, 20.0, 2.2, false);

        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate endDay = epoch.shiftedBy(86400.0);

        System.out.printf(Locale.ROOT,
            "%n=== Drag-Induced Semi-Major Axis Loss (ISS, 24 h) ===%n" +
            "  CD = 2.2, A = 20 m², m = 420 kg  (B = %.4f m²/kg)%n",
            0.5 * 2.2 * 20.0 / 420.0);

        SpacecraftState dragEnd = withDrag.propagate(endDay);
        SpacecraftState noDragEnd = noDrag.propagate(endDay);
        double smaLossM = sma(noDragEnd) - sma(dragEnd);
        double energyLoss = specificEnergy(noDragEnd) - specificEnergy(dragEnd);

        System.out.printf(Locale.ROOT,
            "  No-drag a(24h): %.3f km%n" +
            "  Drag    a(24h): %.3f km%n" +
            "  Matched SMA loss: %.1f m%n" +
            "  Matched energy loss: %.6e J/kg%n" +
            "  Min threshold: %.1f m  [%s]%n",
            sma(noDragEnd) / 1000, sma(dragEnd) / 1000, smaLossM, energyLoss,
            ValidationConstants.DRAG_MIN_DECAY_24H_M,
            smaLossM >= ValidationConstants.DRAG_MIN_DECAY_24H_M ? "PASS" : "FAIL");

        assertTrue(smaLossM >= ValidationConstants.DRAG_MIN_DECAY_24H_M, String.format(Locale.ROOT,
            "24 h matched semi-major-axis loss %.1f m must exceed threshold %.1f m",
            smaLossM, ValidationConstants.DRAG_MIN_DECAY_24H_M));

        assertTrue(energyLoss > 0.0,
            "Drag case must have lower specific orbital energy than matched no-drag case");
    }

    // ─── No drag → no decay ───────────────────────────────────────────────────────

    @Test
    void disablingDragProducesNegligibleAltitudeChange() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        org.orekit.propagation.analytical.tle.TLE tle =
            new org.orekit.propagation.analytical.tle.TLE(
                ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);

        NumericalPropagator noDrag = buildNoDragPropagator(tle);
        AbsoluteDate epoch  = tle.getDate();
        AbsoluteDate endDay = epoch.shiftedBy(86400.0);

        double smaStart = sma(noDrag.propagate(epoch));
        double smaEnd   = sma(noDrag.propagate(endDay));

        // Rebuild to get fresh propagator state (propagator is not re-entrant)
        noDrag = buildNoDragPropagator(tle);
        smaStart = sma(noDrag.propagate(epoch));
        smaEnd   = sma(noDrag.propagate(endDay));

        double changeM = Math.abs(smaEnd - smaStart);
        System.out.printf(Locale.ROOT,
            "%n=== No-Drag Semi-Major Axis Stability (24 h) ===%n" +
            "  a start: %.4f km%n  a end:   %.4f km%n  |Δa|: %.4f m%n",
            smaStart / 1000, smaEnd / 1000, changeM);

        assertTrue(changeM < 100.0, String.format(Locale.ROOT,
            "Without drag, semi-major axis change over 24 h must be < 100 m (got %.4f m)", changeM));
    }

    // ─── Higher drag area → faster decay ─────────────────────────────────────────

    @Test
    void higherDragAreaProducesFasterDecay() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "NRLMSISE00 data required — set OREKIT_DATA_PATH");

        org.orekit.propagation.analytical.tle.TLE tle =
            new org.orekit.propagation.analytical.tle.TLE(
                ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);

        AbsoluteDate epoch  = tle.getDate();
        AbsoluteDate endDay = epoch.shiftedBy(86400.0);

        NumericalPropagator lowDrag  = buildDragPropagator(tle, 5.0,  2.2, true);
        NumericalPropagator highDrag = buildDragPropagator(tle, 40.0, 2.2, true);

        NumericalPropagator noDrag = buildDragPropagator(tle, 5.0, 2.2, false);
        double referenceEnd = sma(noDrag.propagate(endDay));
        double lowEnd    = sma(lowDrag.propagate(endDay));
        double highEnd   = sma(highDrag.propagate(endDay));

        double lowDecay  = referenceEnd - lowEnd;
        double highDecay = referenceEnd - highEnd;

        System.out.printf(Locale.ROOT,
            "%n=== Drag-Area Sensitivity (24 h decay) ===%n" +
            "  No-drag a(24h): %.4f km%n" +
            "  A = 5 m²:  a(24h) %.4f km  matched loss %.1f m%n" +
            "  A = 40 m²: a(24h) %.4f km  matched loss %.1f m%n" +
            "  Decay ratio (should be ~8×): %.2f%n",
            referenceEnd / 1000, lowEnd / 1000, lowDecay, highEnd / 1000, highDecay,
            highDecay / Math.max(lowDecay, 1e-9));

        assertTrue(highDecay > lowDecay, String.format(Locale.ROOT,
            "High-drag (A=40 m²) SMA loss %.4f m must exceed low-drag (A=5 m²) %.4f m",
            highDecay, lowDecay));

        // Expect roughly linear scaling: 40/5 = 8×
        double decayRatio = highDecay / Math.max(lowDecay, 1e-9);
        assertTrue(decayRatio > 3.0 && decayRatio < 30.0, String.format(Locale.ROOT,
            "Drag-area decay ratio %.2f should be in [3, 30] (expected ~8×)", decayRatio));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static NumericalPropagator buildDragPropagator(
            org.orekit.propagation.analytical.tle.TLE tle,
            double dragAreaM2, double cd, boolean includeDrag) {

        org.orekit.propagation.analytical.tle.TLEPropagator seed =
            org.orekit.propagation.analytical.tle.TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        org.orekit.utils.PVCoordinates pv = seed.getPVCoordinates(epoch, FramesFactory.getEME2000());
        org.orekit.orbits.CartesianOrbit orbit = new org.orekit.orbits.CartesianOrbit(
            pv, FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0 = new SpacecraftState(orbit);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1.0, 1e-3);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);

        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(8, 8)));

        if (includeDrag) {
            OneAxisEllipsoid earth = new OneAxisEllipsoid(
                RE, Constants.WGS84_EARTH_FLATTENING,
                FramesFactory.getITRF(IERSConventions.IERS_2010, true));
            prop.addForceModel(new DragForce(
                new NRLMSISE00(
                    new CssiSpaceWeatherData(CssiSpaceWeatherData.DEFAULT_SUPPORTED_NAMES),
                    CelestialBodyFactory.getSun(), earth),
                new IsotropicDrag(dragAreaM2, cd)));
        }
        return prop;
    }

    private static NumericalPropagator buildNoDragPropagator(
            org.orekit.propagation.analytical.tle.TLE tle) {
        return buildDragPropagator(tle, 20.0, 2.2, false);
    }

    private static double sma(SpacecraftState state) {
        return new KeplerianOrbit(state.getOrbit()).getA();
    }

    private static double specificEnergy(SpacecraftState state) {
        double v2 = state.getPVCoordinates().getVelocity().getNormSq();
        double r = state.getPVCoordinates().getPosition().getNorm();
        return 0.5 * v2 - GM / r;
    }

}
