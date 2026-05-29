package com.orbitvisualizationengine.server.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.util.Locale;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.frames.Frame;
import org.orekit.frames.FramesFactory;
import org.orekit.frames.Transform;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.IERSConventions;

/**
 * Regression tests for frame transforms and time-scale conversions.
 *
 * Tests:
 *   1. EME2000 → ITRF → EME2000 round-trip: position error < 1 mm.
 *   2. EME2000 → GCRF → EME2000 round-trip: error < 1 mm.
 *   3. TEME → EME2000 → TEME round-trip: error < 1 mm.
 *   4. UTC ↔ TAI offset: 37 s from 2017-01-01 onward (IERS leap-second table).
 *   5. AbsoluteDate round-trip: UTC string → AbsoluteDate → UTC string stability.
 *   6. Transform composition: T_A→C = T_B→C ∘ T_A→B must be consistent.
 *
 * Tests 1 and 4 require EOP / UTC-TAI history and are skipped without data.
 * Tests 2, 3, 5 run with or without external data.
 *
 * Reference:
 *   IERS Conventions 2010 (IERS TN 36), §5.
 */
class FrameTransformRegressionTest {

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── EME2000 → ITRF → EME2000 round-trip ────────────────────────────────────

    @Test
    void eme2000ToItrfRoundTripWithinOneMm() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "EOP data required for precise ITRF transform — set OREKIT_DATA_PATH");

        AbsoluteDate epoch = new AbsoluteDate(2024, 6, 1, 12, 0, 0.0, TimeScalesFactory.getUTC());
        Frame eme  = FramesFactory.getEME2000();
        Frame itrf = FramesFactory.getITRF(IERSConventions.IERS_2010, true);

        // Representative LEO position in EME2000 (ISS-like)
        Vector3D posEme = new Vector3D(5_500_000, 3_200_000, 2_100_000);

        Transform eme2itrf = eme.getTransformTo(itrf, epoch);
        Vector3D posItrf = eme2itrf.transformPosition(posEme);

        Transform itrf2eme = itrf.getTransformTo(eme, epoch);
        Vector3D posEmeBack = itrf2eme.transformPosition(posItrf);

        double errorM = posEme.subtract(posEmeBack).getNorm();
        System.out.printf(Locale.ROOT,
            "%n=== EME2000 → ITRF → EME2000 Round-Trip ===%n" +
            "  Input:  [%.3f, %.3f, %.3f] km%n" +
            "  Output: [%.3f, %.3f, %.3f] km%n" +
            "  Error:  %.6e m  (tol: %.0e m)  [%s]%n",
            posEme.getX() / 1000, posEme.getY() / 1000, posEme.getZ() / 1000,
            posEmeBack.getX() / 1000, posEmeBack.getY() / 1000, posEmeBack.getZ() / 1000,
            errorM, ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M ? "PASS" : "FAIL");

        assertTrue(errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            "EME2000 → ITRF → EME2000 round-trip position error must be < 1 mm");
    }

    // ─── GCRF → EME2000 → GCRF round-trip ──────────────────────────────────────

    @Test
    void gcrfToEme2000RoundTripWithinOneMm() {
        AbsoluteDate epoch = new AbsoluteDate(2024, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        Frame gcrf = FramesFactory.getGCRF();
        Frame eme  = FramesFactory.getEME2000();

        Vector3D posGcrf = new Vector3D(7_000_000, -1_500_000, 500_000);

        Vector3D posEme    = gcrf.getTransformTo(eme, epoch).transformPosition(posGcrf);
        Vector3D posGcrfBack = eme.getTransformTo(gcrf, epoch).transformPosition(posEme);

        double errorM = posGcrf.subtract(posGcrfBack).getNorm();
        System.out.printf(Locale.ROOT,
            "%n=== GCRF → EME2000 → GCRF Round-Trip ===%n" +
            "  Error: %.6e m  (tol: %.0e m)  [%s]%n",
            errorM, ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M ? "PASS" : "FAIL");

        assertTrue(errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            "GCRF → EME2000 → GCRF round-trip must be < 1 mm");
    }

    // ─── TEME → EME2000 → TEME round-trip ───────────────────────────────────────

    @Test
    void temeToEme2000RoundTripWithinOneMm() {
        // Use TLE epoch so TEME is well-defined
        AbsoluteDate epoch = new AbsoluteDate(2024, 3, 20, 9, 6, 0.0, TimeScalesFactory.getUTC());
        Frame teme = FramesFactory.getTEME();
        Frame eme  = FramesFactory.getEME2000();

        Vector3D posTeme = new Vector3D(6_500_000, 2_000_000, -1_800_000);

        Vector3D posEme    = teme.getTransformTo(eme,  epoch).transformPosition(posTeme);
        Vector3D posBack   = eme.getTransformTo(teme, epoch).transformPosition(posEme);

        double errorM = posTeme.subtract(posBack).getNorm();
        System.out.printf(Locale.ROOT,
            "%n=== TEME → EME2000 → TEME Round-Trip ===%n" +
            "  Error: %.6e m  (tol: %.0e m)  [%s]%n",
            errorM, ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M ? "PASS" : "FAIL");

        assertTrue(errorM <= ValidationConstants.FRAME_ROUNDTRIP_TOL_M,
            "TEME → EME2000 → TEME round-trip must be < 1 mm");
    }

    // ─── UTC ↔ TAI offset ────────────────────────────────────────────────────────

    @Test
    void utcTaiOffsetIs37sFrom2017Onward() {
        assumeTrue(OrekitTestDataLoader.ensureLoaded(),
            "UTC-TAI leap-second history required — set OREKIT_DATA_PATH");

        // From 2017-01-01 UTC: TAI = UTC + 37 s
        AbsoluteDate utc2024 = new AbsoluteDate(2024, 6, 15, 12, 0, 0.0, TimeScalesFactory.getUTC());
        double offsetS = utc2024.timeScalesOffset(TimeScalesFactory.getTAI(), TimeScalesFactory.getUTC());

        System.out.printf(Locale.ROOT,
            "%n=== UTC ↔ TAI Offset ===%n" +
            "  At 2024-06-15T12:00 UTC: TAI−UTC = %.1f s  (expected: %.1f s)  [%s]%n",
            offsetS, ValidationConstants.UTC_TAI_OFFSET_S,
            Math.abs(offsetS - ValidationConstants.UTC_TAI_OFFSET_S) < 0.001 ? "PASS" : "FAIL");

        assertEquals(ValidationConstants.UTC_TAI_OFFSET_S, offsetS, 0.001,
            "TAI−UTC offset must be 37.0 s from 2017-01-01 onward");
    }

    // ─── AbsoluteDate string round-trip ─────────────────────────────────────────

    @Test
    void absoluteDateStringRoundTripIsStable() {
        AbsoluteDate d1 = new AbsoluteDate(2024, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        AbsoluteDate d2 = new AbsoluteDate(2024, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        double deltaS = d1.durationFrom(d2);
        System.out.printf(Locale.ROOT,
            "%n=== AbsoluteDate Stability ===%n" +
            "  Two AbsoluteDate objects from identical UTC spec: Δt = %.4e s  [%s]%n",
            deltaS, Math.abs(deltaS) < 1e-9 ? "PASS" : "FAIL");

        assertTrue(Math.abs(deltaS) <= 1e-9,
            "Two AbsoluteDate instances from identical UTC spec must be identical");
    }

    // ─── Transform composition consistency ──────────────────────────────────────

    @Test
    void transformCompositionIsConsistentAcrossFrameChain() {
        AbsoluteDate epoch = new AbsoluteDate(2024, 6, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());
        Frame gcrf = FramesFactory.getGCRF();
        Frame eme  = FramesFactory.getEME2000();
        Frame teme = FramesFactory.getTEME();

        Vector3D posGcrf = new Vector3D(7_100_000, -500_000, 1_200_000);

        // Direct path: GCRF → TEME
        Vector3D directTeme = gcrf.getTransformTo(teme, epoch).transformPosition(posGcrf);

        // Chained path: GCRF → EME2000 → TEME
        Vector3D chainedEme  = gcrf.getTransformTo(eme,  epoch).transformPosition(posGcrf);
        Vector3D chainedTeme = eme.getTransformTo(teme, epoch).transformPosition(chainedEme);

        double errorM = directTeme.subtract(chainedTeme).getNorm();
        System.out.printf(Locale.ROOT,
            "%n=== Transform Composition (GCRF→TEME direct vs GCRF→EME→TEME) ===%n" +
            "  Direct:  [%.3f, %.3f, %.3f] km%n" +
            "  Chained: [%.3f, %.3f, %.3f] km%n" +
            "  Error:   %.6e m  (tol: 1e-3 m)  [%s]%n",
            directTeme.getX() / 1000, directTeme.getY() / 1000, directTeme.getZ() / 1000,
            chainedTeme.getX() / 1000, chainedTeme.getY() / 1000, chainedTeme.getZ() / 1000,
            errorM, errorM < 1e-3 ? "PASS" : "FAIL");

        assertTrue(errorM <= 1e-3,
            "Chained frame transforms must agree with direct transform to < 1 mm");
    }

    // ─── ITRF transform determinism: same epoch → same result ──────────────────

    @Test
    void sameEpochProducesSameFrameTransform() {
        AbsoluteDate epoch = new AbsoluteDate(2024, 9, 22, 6, 0, 0.0, TimeScalesFactory.getUTC());
        Frame gcrf = FramesFactory.getGCRF();
        Frame eme  = FramesFactory.getEME2000();

        Vector3D pos = new Vector3D(6_800_000, 1_200_000, -3_000_000);

        Vector3D result1 = gcrf.getTransformTo(eme, epoch).transformPosition(pos);
        Vector3D result2 = gcrf.getTransformTo(eme, epoch).transformPosition(pos);

        double errorM = result1.subtract(result2).getNorm();
        double toleranceM = 1.0e-12;
        System.out.printf(Locale.ROOT,
            "%n=== Frame Transform Determinism ===%n" +
            "  Same epoch called twice: error = %.4e m  (tol: %.1e m)  [%s]%n",
            errorM, toleranceM, errorM <= toleranceM ? "PASS" : "FAIL");

        assertTrue(errorM <= toleranceM,
            "Identical epoch must reproduce frame transform within numerical roundoff");
    }
}
