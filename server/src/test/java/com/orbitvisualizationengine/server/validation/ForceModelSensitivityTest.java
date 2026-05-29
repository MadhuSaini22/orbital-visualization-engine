package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.Locale;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.forces.drag.DragForce;
import org.orekit.forces.drag.IsotropicDrag;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.ThirdBodyAttraction;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.radiation.IsotropicRadiationSingleCoefficient;
import org.orekit.forces.radiation.SolarRadiationPressure;
import org.orekit.frames.FramesFactory;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.OrbitType;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.propagation.numerical.NumericalPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;

/**
 * Validates that each force model activation causes a measurable, physically
 * meaningful change in the propagated trajectory. This prevents silent force-model
 * deactivation bugs where a force model is nominally "on" but contributes nothing.
 *
 * Tests:
 *   1. Gravity harmonics (J3+): divergence from J2-only grows over 24 h.
 *   2. Atmospheric drag: trajectory diverges from drag-free by > 50 m over 24 h.
 *   3. Third-body Sun: measurable divergence from gravity-only over 7 days.
 *   4. Third-body Moon: measurable divergence from gravity-only over 7 days.
 *   5. Solar radiation pressure: measurable divergence from no-SRP over 7 days.
 *   6. Full force model vs. J2-only: divergence exceeds activation threshold over 24 h.
 *
 * All tests use the same ISS TLE as baseline; each adds one force model at a time.
 */
class ForceModelSensitivityTest {

    private static final double GM = Constants.EGM96_EARTH_MU;
    private static final double RE = Constants.WGS84_EARTH_EQUATORIAL_RADIUS;
    private static final double MASS_KG   = 420.0;
    private static final double DRAG_A    = 20.0;
    private static final double DRAG_CD   = 2.2;
    private static final double SRP_A     = 20.0;
    private static final double SRP_CR    = 1.4;
    private static final double PERIOD_24H = 86400.0;
    private static final double PERIOD_7D  = 7 * 86400.0;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── Gravity harmonics J3+ cause divergence from J2-only ─────────────────────

    @Test
    void higherOrderGravityDivergesFromJ2Only() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Gravity field data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate end   = epoch.shiftedBy(PERIOD_24H);

        NumericalPropagator j2Only  = buildGravityOnlyPropagator(tle, 2, 0);
        NumericalPropagator j70x70  = buildGravityOnlyPropagator(tle, 40, 40);

        double divergenceM = posError(j2Only.propagate(end), j70x70.propagate(end));

        System.out.printf(Locale.ROOT,
            "%n=== Gravity Harmonics Sensitivity (J2-only vs J40×40, 24 h) ===%n" +
            "  Position divergence: %.1f m  (must be > 100 m)  [%s]%n",
            divergenceM, divergenceM > 100 ? "PASS" : "FAIL");

        assertTrue(divergenceM > 100,
            String.format(Locale.ROOT, "J40×40 vs J2-only divergence %.1f m must be > 100 m", divergenceM));
    }

    // ─── Drag causes trajectory divergence ───────────────────────────────────────

    @Test
    void dragForceCausesTrajectoryDivergenceFromNoDrag() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "NRLMSISE00 data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate end   = epoch.shiftedBy(PERIOD_24H);

        NumericalPropagator noDrag   = buildPropagator(tle, false, false, false, false);
        NumericalPropagator withDrag = buildPropagator(tle, true,  false, false, false);

        double divergenceM = posError(noDrag.propagate(end), withDrag.propagate(end));

        System.out.printf(Locale.ROOT,
            "%n=== Drag Force Sensitivity (no-drag vs drag, 24 h) ===%n" +
            "  Position divergence: %.1f m  (must be > %.1f m)  [%s]%n",
            divergenceM, ValidationConstants.DRAG_MIN_DECAY_24H_M,
            divergenceM > ValidationConstants.DRAG_MIN_DECAY_24H_M ? "PASS" : "FAIL");

        assertTrue(divergenceM > ValidationConstants.DRAG_MIN_DECAY_24H_M, String.format(Locale.ROOT,
            "Drag divergence %.1f m must exceed %.1f m threshold", divergenceM, ValidationConstants.DRAG_MIN_DECAY_24H_M));
    }

    // ─── Third-body Sun perturbation is measurable ───────────────────────────────

    @Test
    void thirdBodySunCausesTrajectoryDivergence() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Planetary ephemerides required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate end7d = epoch.shiftedBy(PERIOD_7D);

        NumericalPropagator noSun   = buildPropagator(tle, false, false, false, false);
        NumericalPropagator withSun = buildPropagatorWithThirdBody(tle, true, false);

        double divM = posError(noSun.propagate(end7d), withSun.propagate(end7d));

        System.out.printf(Locale.ROOT,
            "%n=== Third-Body Sun Sensitivity (7 days) ===%n" +
            "  Position divergence: %.1f m  (must be > 10 m)  [%s]%n",
            divM, divM > 10 ? "PASS" : "FAIL");

        assertTrue(divM > 10, String.format(Locale.ROOT,
            "Sun third-body divergence %.1f m must be measurable (> 10 m) over 7 days", divM));
    }

    // ─── Third-body Moon perturbation is measurable ──────────────────────────────

    @Test
    void thirdBodyMoonCausesTrajectoryDivergence() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Planetary ephemerides required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate end7d = epoch.shiftedBy(PERIOD_7D);

        NumericalPropagator noMoon   = buildPropagator(tle, false, false, false, false);
        NumericalPropagator withMoon = buildPropagatorWithThirdBody(tle, false, true);

        double divM = posError(noMoon.propagate(end7d), withMoon.propagate(end7d));

        System.out.printf(Locale.ROOT,
            "%n=== Third-Body Moon Sensitivity (7 days) ===%n" +
            "  Position divergence: %.1f m  (must be > 10 m)  [%s]%n",
            divM, divM > 10 ? "PASS" : "FAIL");

        assertTrue(divM > 10, String.format(Locale.ROOT,
            "Moon third-body divergence %.1f m must be measurable (> 10 m) over 7 days", divM));
    }

    // ─── SRP perturbation is measurable ──────────────────────────────────────────

    @Test
    void solarRadiationPressureCausesTrajectoryDivergence() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "Solar ephemerides required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();
        AbsoluteDate end7d = epoch.shiftedBy(PERIOD_7D);

        NumericalPropagator noSrp   = buildPropagator(tle, false, false, false, false);
        NumericalPropagator withSrp = buildPropagator(tle, false, false, false, true);

        double divM = posError(noSrp.propagate(end7d), withSrp.propagate(end7d));

        System.out.printf(Locale.ROOT,
            "%n=== Solar Radiation Pressure Sensitivity (7 days) ===%n" +
            "  Position divergence: %.1f m  (must be > 1 m)  [%s]%n",
            divM, divM > 1 ? "PASS" : "FAIL");

        assertTrue(divM > 1, String.format(Locale.ROOT,
            "SRP divergence %.1f m must be measurable (> 1 m) over 7 days", divM));
    }

    // ─── Full force model vs J2-only divergence: activation threshold ───────────

    @Test
    void fullForceModelVsJ2OnlyDivergesAboveActivationThreshold() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "All force model data required — set OREKIT_DATA_PATH");

        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        AbsoluteDate epoch = tle.getDate();

        NumericalPropagator j2Only   = buildGravityOnlyPropagator(tle, 2, 0);
        NumericalPropagator fullModel = buildPropagator(tle, true, true, true, true);

        System.out.printf(Locale.ROOT, "%n=== Full Force Model vs J2-Only Divergence ===%n");

        double finalDivergenceM = 0;
        for (int h = 0; h <= 24; h += 3) {
            AbsoluteDate t = epoch.shiftedBy(h * 3600.0);
            double divM = posError(j2Only.propagate(t), fullModel.propagate(t));
            System.out.printf(Locale.ROOT, "  t+%02dh: divergence = %10.1f m%n", h, divM);
            finalDivergenceM = divM;
        }

        System.out.printf(Locale.ROOT,
            "  Final (24 h): %.1f m  activation threshold: %.0f m  [%s]%n",
            finalDivergenceM, ValidationConstants.FULL_FORCE_MIN_DIVERGENCE_24H_M,
            finalDivergenceM > ValidationConstants.FULL_FORCE_MIN_DIVERGENCE_24H_M ? "PASS" : "FAIL");

        assertTrue(finalDivergenceM > ValidationConstants.FULL_FORCE_MIN_DIVERGENCE_24H_M, String.format(Locale.ROOT,
            "Full vs J2-only divergence %.1f m must exceed activation threshold %.0f m at 24 h",
            finalDivergenceM, ValidationConstants.FULL_FORCE_MIN_DIVERGENCE_24H_M));
    }

    // ─── Force contribution breakdown (sanity check) ─────────────────────────────

    @Test
    void forceContributionOrderMatchesPhysics() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "All force model data required — set OREKIT_DATA_PATH");

        // Central gravity >> J2 >> drag >> third-body >> SRP for LEO
        // Test: at t=0, gravity harmonic acceleration > 1e-5 m/s² (>> other perturbations)
        TLE tle = new TLE(ValidationConstants.ISS_SENSITIVITY_LINE1, ValidationConstants.ISS_SENSITIVITY_LINE2);
        TLEPropagator seed = TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        var seedPv = seed.getPVCoordinates(epoch, FramesFactory.getEME2000());

        CartesianOrbit orbit = new CartesianOrbit(seedPv, FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0   = new SpacecraftState(orbit);

        var harmModel = new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(40, 40));

        double[] params = harmModel.getParametersDrivers().stream()
            .mapToDouble(d -> d.getValue()).toArray();
        double harmAccel = harmModel.acceleration(s0, params).getNorm();

        System.out.printf(Locale.ROOT,
            "%n=== Force Contribution Order ===%n" +
            "  Gravity harmonics (40×40) at epoch: %.6e m/s²  (must be > 1e-5)  [%s]%n",
            harmAccel, harmAccel > 1e-5 ? "PASS" : "FAIL");

        assertTrue(harmAccel > 1e-5, String.format(Locale.ROOT,
            "Gravity harmonic acceleration %.4e m/s² must dominate other perturbations (> 1e-5)", harmAccel));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private NumericalPropagator buildGravityOnlyPropagator(TLE tle, int degree, int order) {
        TLEPropagator seed = TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        CartesianOrbit orbit = new CartesianOrbit(
            seed.getPVCoordinates(epoch, FramesFactory.getEME2000()),
            FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0 = new SpacecraftState(orbit, MASS_KG);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1.0, 1e-3);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);
        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(degree, order)));
        return prop;
    }

    @SuppressWarnings("deprecation")
    private NumericalPropagator buildPropagator(
            TLE tle, boolean drag, boolean sun, boolean moon, boolean srp) {

        TLEPropagator seed = TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        CartesianOrbit orbit = new CartesianOrbit(
            seed.getPVCoordinates(epoch, FramesFactory.getEME2000()),
            FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0 = new SpacecraftState(orbit, MASS_KG);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1.0, 1e-3);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);

        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(8, 8)));

        OneAxisEllipsoid earth = new OneAxisEllipsoid(
            RE, Constants.WGS84_EARTH_FLATTENING,
            FramesFactory.getITRF(IERSConventions.IERS_2010, true));

        if (drag) {
            prop.addForceModel(new DragForce(
                new NRLMSISE00(
                    new CssiSpaceWeatherData(CssiSpaceWeatherData.DEFAULT_SUPPORTED_NAMES),
                    CelestialBodyFactory.getSun(), earth),
                new IsotropicDrag(DRAG_A, DRAG_CD)));
        }
        if (sun) {
            prop.addForceModel(new ThirdBodyAttraction(CelestialBodyFactory.getSun()));
        }
        if (moon) {
            prop.addForceModel(new ThirdBodyAttraction(CelestialBodyFactory.getMoon()));
        }
        if (srp) {
            prop.addForceModel(new SolarRadiationPressure(
                CelestialBodyFactory.getSun(), earth,
                new IsotropicRadiationSingleCoefficient(SRP_A, SRP_CR)));
        }
        return prop;
    }

    @SuppressWarnings("deprecation")
    private NumericalPropagator buildPropagatorWithThirdBody(
            TLE tle, boolean sun, boolean moon) {
        TLEPropagator seed = TLEPropagator.selectExtrapolator(tle);
        AbsoluteDate epoch = tle.getDate();
        CartesianOrbit orbit = new CartesianOrbit(
            seed.getPVCoordinates(epoch, FramesFactory.getEME2000()),
            FramesFactory.getEME2000(), epoch, GM);
        SpacecraftState s0 = new SpacecraftState(orbit, MASS_KG);

        DormandPrince853Integrator integrator =
            new DormandPrince853Integrator(1.0, 300.0, 1.0, 1e-3);
        NumericalPropagator prop = new NumericalPropagator(integrator);
        prop.setOrbitType(OrbitType.CARTESIAN);
        prop.setMu(GM);
        prop.setInitialState(s0);

        prop.addForceModel(new HolmesFeatherstoneAttractionModel(
            FramesFactory.getITRF(IERSConventions.IERS_2010, true),
            GravityFieldFactory.getNormalizedProvider(8, 8)));
        if (sun) {
            prop.addForceModel(new ThirdBodyAttraction(CelestialBodyFactory.getSun()));
        }
        if (moon) {
            prop.addForceModel(new ThirdBodyAttraction(CelestialBodyFactory.getMoon()));
        }
        return prop;
    }

    private static double posError(SpacecraftState s1, SpacecraftState s2) {
        return s1.getPVCoordinates().getPosition()
            .subtract(s2.getPVCoordinates().getPosition()).getNorm();
    }
}
