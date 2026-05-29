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
 * Validates a synthetic CCSDS OEM trajectory and demonstrates how Orekit
 * propagation results can be compared against independently formatted
 * ephemeris data.
 *
 * The OEM content in {@link ValidationReferenceDataset#OEM_CIRCULAR_500KM_CONTENT}
 * is computed from {@link AnalyticalKeplerianPropagator} — an independent
 * Java implementation with no Orekit dependencies.  Comparing Orekit against
 * this OEM constitutes internal cross-validation, not an external flight-data
 * comparison.
 *
 * The test also validates the OEM format itself against CCSDS 502.0-B-2:
 *   – Required header keywords present
 *   – State vector lines parseable and physically consistent
 *   – Position magnitudes within expected orbit band
 *   – Epoch ordering (monotonically increasing)
 *
 * Tests:
 *   1. OEM header keywords conform to CCSDS 502.0-B-2 §4.2.
 *   2. Parsed state vectors match the analytical propagator (cross-validation).
 *   3. Orekit propagation matches OEM state vectors to < 1 m.
 *   4. Position magnitudes in OEM are within expected orbit band.
 *   5. Epoch sequence is monotonically increasing.
 *   6. OEM orbit energy from each state vector is conserved to < 1e-9 relative.
 *
 * References:
 *   [CCSDS2011]   CCSDS 502.0-B-2 Blue Book §4 — OEM format specification.
 *   [Vallado2013] §2.6 — EME2000 / J2000 frame definition.
 */
class CcsdsOemReferenceValidationTest {

    private static final double GM = ValidationReferenceDataset.GM;

    @BeforeAll
    static void initOrekit() {
        OrekitTestDataLoader.ensureLoaded();
    }

    // ─── 1. CCSDS header keywords present  [CCSDS2011 §4.2] ────────────────────

    @Test
    void oemHeaderContainsMandatoryKeywords_CcsdsStd() {
        String oem = ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT;

        String[] required = {
            "CCSDS_OEM_VERS",   // [CCSDS2011 §4.2.2]
            "CREATION_DATE",    // [CCSDS2011 §4.2.2]
            "ORIGINATOR",       // [CCSDS2011 §4.2.2]
            "META_START",       // [CCSDS2011 §4.3]
            "OBJECT_NAME",      // [CCSDS2011 §4.3]
            "CENTER_NAME",      // [CCSDS2011 §4.3]
            "REF_FRAME",        // [CCSDS2011 §4.3]
            "TIME_SYSTEM",      // [CCSDS2011 §4.3]
            "START_TIME",       // [CCSDS2011 §4.3]
            "STOP_TIME",        // [CCSDS2011 §4.3]
            "META_STOP",        // [CCSDS2011 §4.3]
        };

        System.out.printf(Locale.ROOT, "%n=== CCSDS OEM Header Compliance  [CCSDS 502.0-B-2 §4.2] ===%n");
        for (String kw : required) {
            boolean present = oem.contains(kw);
            System.out.printf(Locale.ROOT, "  %-20s  %s%n", kw, present ? "PRESENT" : "MISSING");
            assertTrue(present, "Required CCSDS OEM keyword missing: " + kw);
        }

        // Version must be 2.0
        assertTrue(oem.contains("CCSDS_OEM_VERS = 2.0"),
            "OEM version must be 2.0 per CCSDS 502.0-B-2");
        assertTrue(oem.contains("EME2000"),
            "Reference frame must be EME2000 (J2000)");
        assertTrue(oem.contains("UTC"),
            "Time system must be UTC");
    }

    // ─── 2. Parsed OEM state vectors match analytical propagator ────────────────

    @Test
    void oemStateVectorsMatchAnalyticalPropagatorToOneMeter() {
        ValidationReferenceDataset.ReferenceState ref =
            ValidationReferenceDataset.LEO_CIRCULAR_500KM;

        List<double[]> oemStates = parseOemStateVectors(
            ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);

        double a  = ref.a();
        double T  = ref.periodS();
        double[] fracs = {0.0, 0.25, 0.50, 0.75};

        System.out.printf(Locale.ROOT,
            "%n=== OEM vs Analytical Propagator (cross-validation) ===%n");

        for (int k = 0; k < oemStates.size(); k++) {
            double dt  = fracs[k] * T;
            double[] oemPos = {oemStates.get(k)[0] * 1000, oemStates.get(k)[1] * 1000,
                               oemStates.get(k)[2] * 1000};   // km → m

            double[] analytical = AnalyticalKeplerianPropagator.propagate(
                a, ref.e(),
                Math.toRadians(ref.iDeg()), Math.toRadians(ref.raanDeg()),
                Math.toRadians(ref.aopDeg()), Math.toRadians(ref.nuDeg()),
                dt, GM);

            double errM = norm3(sub3(oemPos, new double[]{analytical[0], analytical[1], analytical[2]}));
            System.out.printf(Locale.ROOT,
                "  t=%.2fT (%.1fs):  OEM|r|=%.3fkm  analytical err=%.6fm  [%s]%n",
                fracs[k], dt, norm3(oemPos) / 1000, errM, errM < 0.001 ? "PASS" : "FAIL");

            assertEquals(0.0, errM, 0.001,
                "OEM state vector must match analytical propagator to < 1 mm at t=" + fracs[k] + "T");
        }
    }

    // ─── 3. Orekit propagation matches OEM state vectors < 1 m ─────────────────

    @Test
    void orekitPropagationMatchesOemStateVectorsToOneMeter() {
        ValidationReferenceDataset.ReferenceState ref =
            ValidationReferenceDataset.LEO_CIRCULAR_500KM;
        AbsoluteDate epoch = new AbsoluteDate(2000, 1, 1, 0, 0, 0.0, TimeScalesFactory.getUTC());

        KeplerianOrbit orbit = new KeplerianOrbit(
            ref.a(), ref.e(),
            Math.toRadians(ref.iDeg()), Math.toRadians(ref.aopDeg()),
            Math.toRadians(ref.raanDeg()), Math.toRadians(ref.nuDeg()),
            PositionAngleType.TRUE, FramesFactory.getEME2000(), epoch, GM);
        KeplerianPropagator prop = new KeplerianPropagator(orbit);

        List<double[]> oemStates = parseOemStateVectors(
            ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);
        double T = ref.periodS();
        double[] fracs = {0.0, 0.25, 0.50, 0.75};

        System.out.printf(Locale.ROOT,
            "%n=== Orekit vs OEM Ephemeris (synthetic CCSDS cross-check) ===%n");

        for (int k = 0; k < oemStates.size(); k++) {
            double dt   = fracs[k] * T;
            AbsoluteDate t = epoch.shiftedBy(dt);

            double[] oemPosMKm = oemStates.get(k);
            double[] oemPos = {oemPosMKm[0] * 1000, oemPosMKm[1] * 1000, oemPosMKm[2] * 1000};

            PVCoordinates pv = prop.getPVCoordinates(t, FramesFactory.getEME2000());
            double[] oPos = pv.getPosition().toArray();

            double errM = norm3(sub3(oPos, oemPos));
            System.out.printf(Locale.ROOT,
                "  t=%.2fT:  Orekit|r|=%.3fkm  OEM|r|=%.3fkm  err=%.6fm  [%s]%n",
                fracs[k], norm3(oPos)/1000, norm3(oemPos)/1000, errM, errM < 1.0 ? "PASS" : "FAIL");

            assertEquals(0.0, errM, 1.0,
                "Orekit must match OEM ephemeris position to < 1 m at t=" + fracs[k] + "T");
        }
    }

    // ─── 4. OEM position magnitudes in expected orbit band ──────────────────────

    @Test
    void oemPositionMagnitudesWithinExpectedOrbitBand() {
        double expectedR = ValidationReferenceDataset.LEO_CIRCULAR_500KM.a();
        List<double[]> states = parseOemStateVectors(
            ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);

        System.out.printf(Locale.ROOT,
            "%n=== OEM Orbit Band Check (500 km circular, expected |r|=%.3f km) ===%n",
            expectedR / 1000);

        for (int k = 0; k < states.size(); k++) {
            double[] s = states.get(k);
            double posKm = Math.sqrt(s[0]*s[0] + s[1]*s[1] + s[2]*s[2]);   // km
            double errKm = Math.abs(posKm - expectedR / 1000);
            System.out.printf(Locale.ROOT,
                "  State %d: |r|=%.6f km  err=%.6f km  [%s]%n",
                k, posKm, errKm, errKm < 0.01 ? "PASS" : "FAIL");
            assertEquals(expectedR / 1000, posKm, 0.01,
                "OEM position magnitude must be within 10 m of circular orbit radius");
        }
    }

    // ─── 5. OEM epoch sequence monotonically increasing ─────────────────────────

    @Test
    void oemEpochSequenceIsMonotonicallyIncreasing() {
        List<Double> times = parseOemTimes(ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);
        assertTrue(times.size() >= 2, "OEM must have at least 2 state vectors");

        for (int i = 1; i < times.size(); i++) {
            assertTrue(times.get(i) > times.get(i - 1), String.format(Locale.ROOT,
                "OEM epoch at index %d (%.3f s) must be after epoch at %d (%.3f s)",
                i, times.get(i), i - 1, times.get(i - 1)));
        }

        System.out.printf(Locale.ROOT,
            "%n=== OEM Epoch Monotonicity ===%n  %d epochs, span=%.1f s  [PASS]%n",
            times.size(), times.getLast() - times.get(0));
    }

    // ─── 6. OEM orbital energy conserved across all state vectors ───────────────

    @Test
    void oemOrbitalEnergyConservedAcrossAllStateVectors() {
        List<double[]> states  = parseOemStateVectors(
            ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);
        List<double[]> velStates = parseOemVelocities(
            ValidationReferenceDataset.OEM_CIRCULAR_500KM_CONTENT);

        double eRef = ValidationReferenceDataset.LEO_CIRCULAR_500KM.energyJkg();

        System.out.printf(Locale.ROOT,
            "%n=== OEM Orbital Energy Conservation ===%n  ε_ref = %.6e J/kg%n", eRef);

        for (int k = 0; k < states.size(); k++) {
            double[] p = states.get(k);
            double[] v = velStates.get(k);
            double rM = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]) * 1000;
            double vMs = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) * 1000;
            double energy = 0.5 * vMs * vMs - GM / rM;
            double relErr = Math.abs((energy - eRef) / eRef);

            System.out.printf(Locale.ROOT,
                "  State %d:  ε = %.6e J/kg  relErr = %.4e  [%s]%n",
                k, energy, relErr, relErr < 1e-9 ? "PASS" : "FAIL");

            assertEquals(eRef, energy, Math.abs(eRef) * 1e-9,
                "OEM orbital energy must be conserved to 1e-9 relative across all states");
        }
    }

    // ─── OEM parsing helpers ─────────────────────────────────────────────────────

    /**
     * Minimal OEM state-vector parser for the analytically generated OEM format.
     * Returns list of [x,y,z] in km for each data line.
     */
    private static List<double[]> parseOemStateVectors(String oem) {
        List<double[]> result = new ArrayList<>();
        boolean inData = false;
        for (String line : oem.split("\n")) {
            String t = line.trim();
            if (t.startsWith("META_STOP")) { inData = true; continue; }
            if (!inData || t.isEmpty() || t.startsWith("#") || t.startsWith("META")) continue;
            String[] parts = t.split("\\s+");
            if (parts.length >= 7) {
                result.add(new double[]{
                    Double.parseDouble(parts[1]),
                    Double.parseDouble(parts[2]),
                    Double.parseDouble(parts[3])
                });
            }
        }
        return result;
    }

    /** Returns list of [vx,vy,vz] in km/s for each data line. */
    private static List<double[]> parseOemVelocities(String oem) {
        List<double[]> result = new ArrayList<>();
        boolean inData = false;
        for (String line : oem.split("\n")) {
            String t = line.trim();
            if (t.startsWith("META_STOP")) { inData = true; continue; }
            if (!inData || t.isEmpty() || t.startsWith("#") || t.startsWith("META")) continue;
            String[] parts = t.split("\\s+");
            if (parts.length >= 7) {
                result.add(new double[]{
                    Double.parseDouble(parts[4]),
                    Double.parseDouble(parts[5]),
                    Double.parseDouble(parts[6])
                });
            }
        }
        return result;
    }

    /**
     * Parses epoch times as seconds from day-of-year start.
     * Format: YYYY-DOYThh:mm:ss.sss
     */
    private static List<Double> parseOemTimes(String oem) {
        List<Double> result = new ArrayList<>();
        boolean inData = false;
        for (String line : oem.split("\n")) {
            String t = line.trim();
            if (t.startsWith("META_STOP")) { inData = true; continue; }
            if (!inData || t.isEmpty() || t.startsWith("#") || t.startsWith("META")) continue;
            String[] parts = t.split("\\s+");
            if (parts.length >= 7) {
                // Parse time portion: hh:mm:ss.sss after the 'T'
                String timeStr = parts[0].contains("T")
                    ? parts[0].substring(parts[0].indexOf('T') + 1) : parts[0];
                String[] hms = timeStr.split(":");
                double secs = Double.parseDouble(hms[0]) * 3600
                    + Double.parseDouble(hms[1]) * 60
                    + Double.parseDouble(hms[2]);
                result.add(secs);
            }
        }
        return result;
    }

    private static double norm3(double[] v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static double[] sub3(double[] a, double[] b) {
        return new double[]{a[0]-b[0], a[1]-b[1], a[2]-b[2]};
    }
}
