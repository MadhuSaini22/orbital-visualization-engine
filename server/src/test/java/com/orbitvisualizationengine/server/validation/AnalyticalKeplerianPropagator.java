package com.orbitvisualizationengine.server.validation;

/**
 * Pure-Java two-body Keplerian propagator — no Orekit, no external libraries.
 *
 * Implements the closed-form solution to the two-body problem using:
 *   1. Newton-Raphson iteration for Kepler's equation  M = E − e·sin E
 *   2. Perifocal (PQW) frame position and velocity      (Bate §2.4)
 *   3. Vallado Algorithm 4 (coe2rv) rotation to ECI     (FADA 4th ed. §2.6)
 *
 * This class is an independent implementation of the same physics solved by
 * Orekit's KeplerianPropagator.  Agreeing with Orekit to < 1 m across diverse
 * orbits constitutes cross-validation between two independent codebases.
 *
 * References:
 *   [Vallado2013]  Vallado, D. "Fundamentals of Astrodynamics and Applications"
 *                  4th ed., Algorithms 1, 4.
 *   [Bate1971]     Bate, Mueller, White. "Fundamentals of Astrodynamics" §2.4.
 *   [Danby1992]    Danby, J.M.A. "Fundamentals of Celestial Mechanics" §6.6.
 */
public final class AnalyticalKeplerianPropagator {

    /** EGM96 gravitational parameter [m³/s²] — matches Orekit constant. */
    public static final double GM = 3.986004415e14;

    private AnalyticalKeplerianPropagator() {}

    /**
     * Propagates an orbit defined by classical elements forward by {@code dt} seconds.
     *
     * @param a    semi-major axis [m]
     * @param e    eccentricity (0 ≤ e < 1)
     * @param i    inclination [rad]
     * @param raan right ascension of ascending node [rad]
     * @param aop  argument of perigee [rad]
     * @param m0   initial mean anomaly [rad] at t=0
     * @param dt   time elapsed since epoch [s]
     * @param mu   gravitational parameter [m³/s²]
     * @return [rx, ry, rz, vx, vy, vz] in ECI [m] and [m/s]
     */
    public static double[] propagate(
            double a, double e, double i, double raan, double aop, double m0,
            double dt, double mu) {

        double n  = Math.sqrt(mu / (a * a * a));        // mean motion [rad/s]
        double M  = m0 + n * dt;                         // mean anomaly at t
        double E  = solveKepler(M, e);                   // eccentric anomaly
        double nu = trueAnomaly(E, e);                   // true anomaly

        return coe2rv(a, e, i, raan, aop, nu, mu);
    }

    /**
     * Converts classical orbital elements to ECI state vector (Vallado Alg. 4).
     *
     * @param nu  true anomaly [rad]
     * @return    [rx, ry, rz, vx, vy, vz] in ECI [m, m/s]
     */
    public static double[] coe2rv(
            double a, double e, double i, double raan, double aop, double nu, double mu) {

        double p      = a * (1 - e * e);
        double r      = p / (1 + e * Math.cos(nu));
        double sqMuP  = Math.sqrt(mu / p);

        // PQW (perifocal) frame
        double rP = r * Math.cos(nu),  rQ = r * Math.sin(nu);
        double vP = sqMuP * (-Math.sin(nu)),  vQ = sqMuP * (e + Math.cos(nu));

        // DCM column vectors (Vallado Algorithm 4, eqs. 4-6)
        double cO = Math.cos(raan), sO = Math.sin(raan);
        double cI = Math.cos(i),    sI = Math.sin(i);
        double cW = Math.cos(aop),  sW = Math.sin(aop);

        // x_hat (P direction in ECI)
        double x1 =  cO * cW - sO * sW * cI;
        double x2 =  sO * cW + cO * sW * cI;
        double x3 =  sW * sI;

        // y_hat (Q direction in ECI)
        double y1 = -cO * sW - sO * cW * cI;
        double y2 = -sO * sW + cO * cW * cI;
        double y3 =  cW * sI;

        return new double[]{
            rP * x1 + rQ * y1,
            rP * x2 + rQ * y2,
            rP * x3 + rQ * y3,
            vP * x1 + vQ * y1,
            vP * x2 + vQ * y2,
            vP * x3 + vQ * y3
        };
    }

    /**
     * Converts ECI state vector to classical orbital elements (Vallado Alg. 9 rv2coe).
     *
     * @param rv [rx, ry, rz, vx, vy, vz] in [m, m/s]
     * @return   [a (m), e, i (rad), raan (rad), aop (rad), nu (rad)]
     */
    public static double[] rv2coe(double[] rv, double mu) {
        double rx = rv[0], ry = rv[1], rz = rv[2];
        double vx = rv[3], vy = rv[4], vz = rv[5];

        double rNorm = Math.sqrt(rx*rx + ry*ry + rz*rz);
        double vNorm2 = vx*vx + vy*vy + vz*vz;
        double vr = (rx*vx + ry*vy + rz*vz) / rNorm;  // radial velocity

        // Angular momentum h = r × v
        double hx = ry*vz - rz*vy;
        double hy = rz*vx - rx*vz;
        double hz = rx*vy - ry*vx;
        double hNorm = Math.sqrt(hx*hx + hy*hy + hz*hz);

        // Node vector n = z × h
        double nx = -hy, ny = hx;
        double nNorm = Math.sqrt(nx*nx + ny*ny);

        // Eccentricity vector e = (v × h)/μ − r̂
        double ex = (vy*hz - vz*hy) / mu - rx / rNorm;
        double ey = (vz*hx - vx*hz) / mu - ry / rNorm;
        double ez = (vx*hy - vy*hx) / mu - rz / rNorm;
        double ecc = Math.sqrt(ex*ex + ey*ey + ez*ez);

        // Specific mechanical energy → a
        double energy = 0.5 * vNorm2 - mu / rNorm;
        double a = (Math.abs(energy) > 1e-10) ? -mu / (2 * energy) : Double.POSITIVE_INFINITY;

        // Inclination i = arccos(hz / |h|)
        double inc = Math.acos(hz / hNorm);

        // RAAN Ω = arccos(nx / |n|), quadrant fix: if ny < 0 then Ω = 2π − Ω
        double raan = (nNorm > 1e-3) ? Math.acos(nx / nNorm) : 0.0;
        if (ny < 0) raan = 2 * Math.PI - raan;

        // AoP ω = arccos(n·e / (|n||e|)), quadrant fix: if ez < 0 then ω = 2π − ω
        double aop = 0.0;
        if (nNorm > 1e-3 && ecc > 1e-6) {
            aop = Math.acos((nx*ex + ny*ey) / (nNorm * ecc));
            if (ez < 0) aop = 2 * Math.PI - aop;
        }

        // True anomaly ν = arccos(e·r / (|e||r|)), quadrant fix: if vr < 0 then ν = 2π − ν
        double nu = 0.0;
        if (ecc > 1e-6) {
            nu = Math.acos((ex*rx + ey*ry + ez*rz) / (ecc * rNorm));
            if (vr < 0) nu = 2 * Math.PI - nu;
        } else {
            // Circular: ν from node angle
            nu = (nNorm > 1e-3)
                ? Math.acos((nx*rx + ny*ry) / (nNorm * rNorm))
                : Math.atan2(ry, rx);
            if (rz < 0) nu = 2 * Math.PI - nu;
        }

        return new double[]{a, ecc, inc, raan, aop, nu};
    }

    /**
     * Solves Kepler's equation M = E − e·sin E using Newton-Raphson iteration.
     * Converges to machine precision in ≤ 15 iterations for e < 0.99.
     * Algorithm from Danby (1992) §6.6.
     *
     * @param M mean anomaly [rad] (any value; normalised internally)
     * @param e eccentricity [0, 1)
     * @return  eccentric anomaly E [rad]
     */
    public static double solveKepler(double M, double e) {
        // Normalise M to [0, 2π)
        M = M % (2 * Math.PI);
        if (M < 0) M += 2 * Math.PI;

        // Danby's initial guess — better than E₀=M for high eccentricity
        double E = M + e * Math.sin(M) * (3 - e * (4 - e));

        for (int iter = 0; iter < 50; iter++) {
            double sinE = Math.sin(E), cosE = Math.cos(E);
            double f    = E - e * sinE - M;
            double fp   = 1 - e * cosE;
            double delta = f / fp;
            E -= delta;
            if (Math.abs(delta) < 1e-14) break;
        }
        return E;
    }

    /**
     * Converts eccentric anomaly to true anomaly.
     * Uses the two-argument atan2 form for full quadrant coverage.
     */
    public static double trueAnomaly(double E, double e) {
        return 2 * Math.atan2(
            Math.sqrt(1 + e) * Math.sin(E / 2),
            Math.sqrt(1 - e) * Math.cos(E / 2));
    }

    /** Position magnitude [m] for given elements at true anomaly nu. */
    public static double radius(double a, double e, double nu) {
        return a * (1 - e * e) / (1 + e * Math.cos(nu));
    }

    /** Circular speed [m/s] at radius r. */
    public static double circularSpeed(double r, double mu) {
        return Math.sqrt(mu / r);
    }

    /** Orbital period [s] for semi-major axis a. */
    public static double period(double a, double mu) {
        return 2 * Math.PI * Math.sqrt(a * a * a / mu);
    }

    /** Specific orbital energy [J/kg = m²/s²] for semi-major axis a. */
    public static double specificEnergy(double a, double mu) {
        return -mu / (2 * a);
    }

    /** Specific angular momentum magnitude [m²/s] = √(μ·p). */
    public static double angularMomentum(double a, double e, double mu) {
        double p = a * (1 - e * e);
        return Math.sqrt(mu * p);
    }

    /** Escape speed [m/s] at radius r. */
    public static double escapeSpeed(double r, double mu) {
        return Math.sqrt(2 * mu / r);
    }
}
