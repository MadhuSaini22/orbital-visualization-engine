import type { SatelliteSnapshot } from "@/domain/orbit";
import { formatNumber } from "@/geometry/format";
import { DetailMetric } from "./ui";
import { secondsToDurationLabel } from "./utils";

const earthMuKm3S2 = 398600.4418;
const earthRadiusKm = 6378.137;

export type OrbitSummary = {
  orbitType: string;
  classification: string;
  currentAltitudeKm: number | null;
  localVelocityKmps: number | null;
  perigeeAltitudeKm: number | null;
  apogeeAltitudeKm: number | null;
  semiMajorAxisKm: number | null;
  inclinationDeg: number | null;
  eccentricity: number | null;
  raanDeg: number | null;
  argumentOfPerigeeDeg: number | null;
  periodSeconds: number | null;
};

function vectorNorm(values: [number, number, number]) {
  return Math.hypot(values[0], values[1], values[2]);
}

function vectorCross(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function classifyOrbit(perigeeAltitudeKm: number | null, apogeeAltitudeKm: number | null, eccentricity: number | null) {
  if (perigeeAltitudeKm == null || apogeeAltitudeKm == null) {
    return "Unknown";
  }
  const shape = eccentricity != null && eccentricity < 0.01 ? "Circular" : "Elliptical";
  if (perigeeAltitudeKm < 2000 && apogeeAltitudeKm < 2000) {
    return `LEO / ${shape}`;
  }
  if (perigeeAltitudeKm < 2000 && apogeeAltitudeKm > 30000) {
    return "GTO / Elliptical";
  }
  if (perigeeAltitudeKm >= 2000 && apogeeAltitudeKm < 30000) {
    return `MEO / ${shape}`;
  }
  if (Math.abs(perigeeAltitudeKm - 35786) < 1500 && Math.abs(apogeeAltitudeKm - 35786) < 1500) {
    return `GEO / ${shape}`;
  }
  if (apogeeAltitudeKm >= 30000) {
    return `HEO / ${shape}`;
  }
  return shape;
}

export function orbitSummaryFromSnapshot(snapshot: SatelliteSnapshot | null | undefined): OrbitSummary {
  const satellite = snapshot?.satellite;
  const state = snapshot?.state;
  const base: OrbitSummary = {
    orbitType: satellite?.sourceType === "TLE"
      ? "TLE"
      : satellite?.sourceType === "MANUAL_STATE"
        ? "Manual orbit"
        : satellite?.sourceType ?? "Unknown",
    classification: "Unknown",
    currentAltitudeKm: typeof state?.altitudeKm === "number" && Number.isFinite(state.altitudeKm) ? state.altitudeKm : null,
    localVelocityKmps: typeof state?.velocityKmps === "number" && Number.isFinite(state.velocityKmps) ? state.velocityKmps : null,
    perigeeAltitudeKm: null,
    apogeeAltitudeKm: null,
    semiMajorAxisKm: null,
    inclinationDeg: null,
    eccentricity: null,
    raanDeg: null,
    argumentOfPerigeeDeg: null,
    periodSeconds: null,
  };
  if (!state?.positionEciKm || !state.velocityEciKmps) {
    return { ...base, classification: classifyOrbit(null, null, null) };
  }

  const r = state.positionEciKm;
  const v = state.velocityEciKmps;
  const radiusKm = vectorNorm(r);
  const speedKmps = vectorNorm(v);
  const h = vectorCross(r, v);
  const hNorm = vectorNorm(h);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || !Number.isFinite(speedKmps) || hNorm <= 0) {
    return base;
  }

  const semiMajorAxisKm = 1 / ((2 / radiusKm) - ((speedKmps * speedKmps) / earthMuKm3S2));
  const vxh = vectorCross(v, h);
  const eccentricityVector: [number, number, number] = [
    (vxh[0] / earthMuKm3S2) - (r[0] / radiusKm),
    (vxh[1] / earthMuKm3S2) - (r[1] / radiusKm),
    (vxh[2] / earthMuKm3S2) - (r[2] / radiusKm),
  ];
  const eccentricity = vectorNorm(eccentricityVector);
  const inclinationDeg = Math.acos(Math.max(-1, Math.min(1, h[2] / hNorm))) * 180 / Math.PI;
  const nodeVector: [number, number, number] = [-h[1], h[0], 0];
  const nodeNorm = vectorNorm(nodeVector);
  const raanRad = nodeNorm > 1.0e-10 ? Math.atan2(nodeVector[1], nodeVector[0]) : Number.NaN;
  const argumentOfPerigeeCosine = nodeNorm > 1.0e-10 && eccentricity > 1.0e-8
    ? (nodeVector[0] * eccentricityVector[0] + nodeVector[1] * eccentricityVector[1] + nodeVector[2] * eccentricityVector[2]) / (nodeNorm * eccentricity)
    : Number.NaN;
  const argumentOfPerigeeBaseRad = Number.isFinite(argumentOfPerigeeCosine)
    ? Math.acos(Math.max(-1, Math.min(1, argumentOfPerigeeCosine)))
    : Number.NaN;
  const argumentOfPerigeeRad = Number.isFinite(argumentOfPerigeeBaseRad) && eccentricityVector[2] < 0
    ? (2 * Math.PI) - argumentOfPerigeeBaseRad
    : argumentOfPerigeeBaseRad;
  const perigeeRadiusKm = semiMajorAxisKm * (1 - eccentricity);
  const apogeeRadiusKm = semiMajorAxisKm * (1 + eccentricity);
  const periodSeconds = semiMajorAxisKm > 0 ? 2 * Math.PI * Math.sqrt((semiMajorAxisKm ** 3) / earthMuKm3S2) : null;
  const perigeeAltitudeKm = Number.isFinite(perigeeRadiusKm) ? perigeeRadiusKm - earthRadiusKm : null;
  const apogeeAltitudeKm = Number.isFinite(apogeeRadiusKm) ? apogeeRadiusKm - earthRadiusKm : null;

  return {
    ...base,
    currentAltitudeKm: radiusKm - earthRadiusKm,
    localVelocityKmps: speedKmps,
    perigeeAltitudeKm,
    apogeeAltitudeKm,
    semiMajorAxisKm: Number.isFinite(semiMajorAxisKm) ? semiMajorAxisKm : null,
    inclinationDeg: Number.isFinite(inclinationDeg) ? inclinationDeg : null,
    eccentricity: Number.isFinite(eccentricity) ? eccentricity : null,
    raanDeg: Number.isFinite(raanRad) ? ((raanRad * 180 / Math.PI) + 360) % 360 : null,
    argumentOfPerigeeDeg: Number.isFinite(argumentOfPerigeeRad) ? ((argumentOfPerigeeRad * 180 / Math.PI) + 360) % 360 : null,
    periodSeconds: periodSeconds != null && Number.isFinite(periodSeconds) ? periodSeconds : null,
    classification: classifyOrbit(perigeeAltitudeKm, apogeeAltitudeKm, eccentricity),
  };
}

function formatOrbitValue(value: number | null, unit: string, fractionDigits: number) {
  if (value == null || !Number.isFinite(value)) {
    return "Unavailable";
  }
  const formatted = formatNumber(value, fractionDigits);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function OrbitSummaryPanel({
  summary,
  title = "Orbit Summary",
  subtitle = "Current mission orbit context.",
}: {
  summary: OrbitSummary;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="border border-cyan-300/15 bg-black/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">{title}</p>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
            {summary.orbitType}
          </span>
          <span className="border border-lime-300/25 px-2 py-1 font-mono text-[10px] uppercase text-lime-100">
            {summary.classification}
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <DetailMetric label="Perigee Alt" value={formatOrbitValue(summary.perigeeAltitudeKm, "km", 2)} />
        <DetailMetric label="Apogee Alt" value={formatOrbitValue(summary.apogeeAltitudeKm, "km", 2)} />
        <DetailMetric label="Semi-Major Axis" value={formatOrbitValue(summary.semiMajorAxisKm, "km", 2)} />
        <DetailMetric label="Eccentricity" value={formatOrbitValue(summary.eccentricity, "", 6)} />
        <DetailMetric label="Inclination" value={formatOrbitValue(summary.inclinationDeg, "deg", 3)} />
        <DetailMetric label="RAAN" value={formatOrbitValue(summary.raanDeg, "deg", 3)} />
        <DetailMetric label="Arg Perigee" value={formatOrbitValue(summary.argumentOfPerigeeDeg, "deg", 3)} />
        <DetailMetric label="Period" value={summary.periodSeconds == null ? "Unavailable" : secondsToDurationLabel(summary.periodSeconds)} />
        <DetailMetric label="Current Alt" value={formatOrbitValue(summary.currentAltitudeKm, "km", 2)} />
        <DetailMetric label="Velocity" value={formatOrbitValue(summary.localVelocityKmps, "km/s", 4)} />
      </div>
    </div>
  );
}
