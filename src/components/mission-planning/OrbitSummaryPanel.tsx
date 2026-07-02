import { formatNumber } from "@/geometry/format";
import type { OrbitSummary } from "@/services/OrbitMechanicsService";
import { orbitSummaryFromSnapshot } from "@/services/OrbitMechanicsService";
import { DetailMetric } from "./ui";
import { secondsToDurationLabel } from "./utils";

export type { OrbitSummary };
export { orbitSummaryFromSnapshot };

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
