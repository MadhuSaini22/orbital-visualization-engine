package com.orbitvisualizationengine.server.validation;

/**
 * Reference constants, catalog cases, and thresholds for astrodynamics validation.
 * Items derived from TLEs or local formulas are internal consistency references
 * unless an independent published vector/table is explicitly named.
 *
 * Sources:
 *   [Vallado2006]  Vallado, Crawford, Hujsak, Kelso (2006).
 *                  "Revisiting Spacetrack Report #3." AIAA 2006-6753.
 *                  (SGP4 test vectors, TEME frame, km / km·s⁻¹)
 *
 *   [Brouwer1959]  Brouwer, D. (1959).
 *                  "Solution of the problem of artificial satellite theory without drag."
 *                  AJ, 64, 378.  (first-order secular J2 drift rates)
 *
 *   [Vallado2013]  Vallado, D. (2013). "Fundamentals of Astrodynamics and Applications,"
 *                  4th ed. Microcosm Press.  (conservation law benchmarks, Gauss equations)
 *
 *   [OrekitTutorial] Orekit "Numerical Orbit Propagation" tutorial orbit.
 */
public final class ValidationConstants {

    private ValidationConstants() {}

    // ════════════════════════════════════════════════════════════════════════════
    // VALLADO SGP4 REFERENCE  [Vallado2006], Table 2 — TEME frame, km / km·s⁻¹
    // Satellite 00005 "VANGUARD 1 ROCKET" — sparse, high-eccentricity test case.
    // ════════════════════════════════════════════════════════════════════════════

    public static final String VALLADO_00005_LINE1 =
        "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753";
    public static final String VALLADO_00005_LINE2 =
        "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667";

    // ════════════════════════════════════════════════════════════════════════════
    // ANALYTICAL J2 SECULAR DRIFT  [Brouwer1959]
    // Orbit: a = 6 771 km, e = 0.001, i = 51.63°
    // Constants: J2 = 1.082 63×10⁻³, Rₑ = 6 378.137 km, GM = 398 600.4418 km³s⁻²
    //
    // Secular RAAN rate:  dΩ/dt = −3n J2 (Rₑ/p)² cos i / 2 = −5.039 °/day
    // Secular AoP  rate:  dω/dt =  3n J2 (Rₑ/p)² (5 cos²i−1) / 4 = +3.812 °/day
    // ════════════════════════════════════════════════════════════════════════════

    public static final double J2_A_KM          = 6771.0;
    public static final double J2_ECC           = 0.001;
    public static final double J2_INC_DEG       = 51.63;
    public static final double J2_TOLERANCE_DEG_DAY = 0.10;   // ±2 % of prediction

    // ════════════════════════════════════════════════════════════════════════════
    // SUN-SYNCHRONOUS ORBIT (J2 secular)
    // a = 6 978.137 km (600 km altitude), e = 0, i = 97.79°
    // Required RAAN drift: +0.9856 °/day (matches Sun's apparent motion)
    // ════════════════════════════════════════════════════════════════════════════

    public static final double SSO_A_KM       = 6978.137;
    public static final double SSO_INC_DEG    = 97.79;
    public static final double SSO_RAAN_TARGET_DEG_DAY = 0.9856;
    public static final double SSO_RAAN_TOL_DEG_DAY    = 0.05;

    // ════════════════════════════════════════════════════════════════════════════
    // FULL FORCE MODEL SENSITIVITY INPUT
    // ISS TLE epoch 2026-05-08. The 24 h J2-only vs full-force divergence
    // threshold is an internal activation check chosen well above numerical noise;
    // it is not an external trajectory truth vector.
    // ════════════════════════════════════════════════════════════════════════════

    public static final String ISS_SENSITIVITY_LINE1 =
        "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998";
    public static final String ISS_SENSITIVITY_LINE2 =
        "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554";

    /** Minimum position divergence (m) expected between J2-only and full-fidelity at 24 h. */
    public static final double FULL_FORCE_MIN_DIVERGENCE_24H_M = 5_000.0;

    // ════════════════════════════════════════════════════════════════════════════
    // OREKIT TUTORIAL ORBIT  [OrekitTutorial]
    // a = 7 204.535 848 km, e = 0, i = 98.74°, Ω = 0, ω = 0, M = 0
    // Epoch: 2004-01-01 00:00:00 UTC
    // Orbital period T ≈ 6 090.3 s
    // After one period (two-body): position closure error < 1 m
    // ════════════════════════════════════════════════════════════════════════════

    public static final double OREKIT_A_KM           = 7204.535848109592;
    public static final double OREKIT_INC_DEG        = 98.74;
    // T = 2π√(a³/GM) = 2π√((7204535.848)³ / 3.986004415e14) ≈ 6086 s
    public static final double OREKIT_PERIOD_S       = 6086.0;
    public static final double OREKIT_PERIOD_TOL_S   = 5.0;     // allow ±5 s for GM constant variation
    public static final double OREKIT_PERIOD_CLOSURE_TOL_M = 1.0;

    // ════════════════════════════════════════════════════════════════════════════
    // ENERGY AND ANGULAR MOMENTUM CONSERVATION  [Vallado2013] §2.2, §2.3
    // Two-body specific orbital energy: ε = v²/2 − GM/r = −GM/(2a)
    // Angular momentum magnitude:       h = |r × v| = √(GM · p)
    // For analytical (Keplerian) propagator: relative conservation error < 1×10⁻⁹
    // ════════════════════════════════════════════════════════════════════════════

    public static final double CONS_A_KM          = 6878.137;   // 500 km altitude
    public static final double ENERGY_REL_TOL     = 1.0e-9;
    public static final double MOMENTUM_REL_TOL   = 1.0e-9;

    // ════════════════════════════════════════════════════════════════════════════
    // DRAG-INDUCED ALTITUDE DECAY
    // ISS orbit (400 km) under NRLMSISE00.  Minimum observable decay over 24 h:
    // even at solar minimum the altitude drops > 50 m/day.
    // ════════════════════════════════════════════════════════════════════════════

    public static final double DRAG_MIN_DECAY_24H_M = 50.0;

    // ════════════════════════════════════════════════════════════════════════════
    // MANEUVER DELTA-V  [Vallado2013] §6.3 — Gauss variational equations
    // Circular orbit at 500 km (a = 6 878.137 km, v_c = 7 612.8 m/s).
    // Prograde ΔV = 1.0 m/s → Δa ≈ 2aΔV/v_c = 1 808 m  (linearised)
    // ════════════════════════════════════════════════════════════════════════════

    public static final double MNVR_A_KM            = 6878.137;
    public static final double MNVR_TOLERANCE_FRAC  = 0.07;    // ±7 %

    // ════════════════════════════════════════════════════════════════════════════
    // FRAME TRANSFORM ROUND-TRIP TOLERANCE
    // EME2000 → ITRF → EME2000 position round-trip: < 1 mm (numerical only)
    // UTC ↔ TAI offset from 2017-01-01 onward: exactly 37 s
    // ════════════════════════════════════════════════════════════════════════════

    public static final double FRAME_ROUNDTRIP_TOL_M = 1.0e-3;
    public static final double UTC_TAI_OFFSET_S      = 37.0;

    // ════════════════════════════════════════════════════════════════════════════
    // INTEGRATOR STABILITY BOUNDS
    // Over 24 h ISS propagation: position must stay within LEO band.
    // ════════════════════════════════════════════════════════════════════════════

    public static final double INTEGRATOR_MIN_POS_KM = 6_500.0;
    public static final double INTEGRATOR_MAX_POS_KM = 7_100.0;
}
