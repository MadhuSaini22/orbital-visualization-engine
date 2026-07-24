"use client";

import { startTransition, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { OrbitState, SatelliteSnapshot } from "@/domain/orbit";
import { splitGroundTrackByLongitudeWrap } from "@/geometry/groundTrack";

type GroundTrackMiniMapProps = {
  currentSnapshots: SatelliteSnapshot[];
  groundTrackSnapshots: SatelliteSnapshot[];
  selectedSatelliteIds: string[];
  rangeLabel: string;
  onRangeChange: (rangeId: GroundTrackRangeId) => void;
  rangeOptions: GroundTrackRangeOption[];
  selectedRangeId: GroundTrackRangeId;
  isRangeLoading?: boolean;
};

export type GroundTrackRangeId = "live" | "day" | "week" | "twoMonths" | "twoYears";

export type GroundTrackRangeOption = {
  id: GroundTrackRangeId;
  label: string;
};

const mapWidth = 360;
const mapHeight = 180;

function projectLatLon(state: OrbitState) {
  return {
    x: ((state.longitudeDeg + 180) / 360) * mapWidth,
    y: ((90 - state.latitudeDeg) / 180) * mapHeight,
  };
}

function buildPolylinePoints(states: OrbitState[]) {
  return states
    .map((state) => {
      const point = projectLatLon(state);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");
}

const groundTrackPalette = [
  "#63e6be",
  "#74c0fc",
  "#ffd43b",
  "#ff8787",
  "#b197fc",
  "#ffa94d",
  "#66d9e8",
  "#f783ac",
  "#a9e34b",
  "#91a7ff",
];

function getTrackColor(snapshot: SatelliteSnapshot, index: number, trackCount: number) {
  // A spacecraft's 3D scene color is not guaranteed to be unique. On a
  // multi-track map, use a dedicated palette so every path remains identifiable.
  return trackCount > 1
    ? groundTrackPalette[index % groundTrackPalette.length]
    : snapshot.satellite.visual.color ?? groundTrackPalette[0];
}

export function GroundTrackMiniMap({
  currentSnapshots,
  groundTrackSnapshots,
  selectedSatelliteIds,
  rangeLabel,
  onRangeChange,
  rangeOptions,
  selectedRangeId,
  isRangeLoading = false,
}: GroundTrackMiniMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleTracks = useMemo(() => {
    return groundTrackSnapshots.filter((snapshot) => snapshot.satellite.visual.showGroundTrack);
  }, [groundTrackSnapshots]);

  const currentById = useMemo(() => {
    return new Map(currentSnapshots.map((snapshot) => [snapshot.satellite.id, snapshot]));
  }, [currentSnapshots]);

  return (
    <div className="border border-cyan-300/20 bg-[#071016]/82 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Ground Track Map
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">{rangeLabel} surface trace</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-lime-200">{visibleTracks.length}</span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex h-9 w-9 items-center justify-center border border-cyan-300/35 text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10"
            aria-label="Open expanded ground track map"
            title="Open expanded map"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </div>

      {visibleTracks.length === 0 && (
        <p className="mt-2 text-[11px] text-zinc-500">Enable Ground on a satellite to see its 2D surface path.</p>
      )}
      {selectedRangeId === "twoMonths" || selectedRangeId === "twoYears" ? (
        <p className="mt-2 text-[10px] leading-4 text-amber-100/70">
          Long history is sampled coarsely and is best treated as an approximate visual from the loaded TLE.
        </p>
      ) : null}
      {isExpanded && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/78 p-6 backdrop-blur-sm">
          <div className="flex h-[75vh] w-[75vw] min-w-[720px] flex-col border border-cyan-300/30 bg-[#061015] p-5 shadow-2xl max-lg:h-[82vh] max-lg:w-[92vw] max-lg:min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  Expanded Ground Track
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">Surface Path History</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Larger 2D view for inspecting wave-shaped ground traces across Earth rotation. Longer ranges show more repeated passes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="flex h-10 w-10 items-center justify-center border border-cyan-300/30 text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10"
                aria-label="Close ground track map"
                title="Close"
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <select
                key={selectedRangeId}
                defaultValue={selectedRangeId}
                onChange={(event) => {
                  const rangeId = event.target.value as GroundTrackRangeId;
                  // Keep the native selection responsive, then start the
                  // potentially expensive history refresh after it has painted.
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      startTransition(() => onRangeChange(rangeId));
                    });
                  });
                }}
                className="min-w-48 border border-cyan-300/20 bg-black/45 px-3 py-2 font-mono text-xs uppercase text-cyan-100 outline-none transition focus:border-cyan-300"
                aria-label="Expanded ground track time range"
              >
                {rangeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="font-mono text-xs text-lime-200">{visibleTracks.length} ground tracks visible</span>
            </div>
            {visibleTracks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Ground track legend">
                {visibleTracks.map((track, index) => (
                  <div
                    key={track.satellite.id}
                    className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-zinc-300"
                    title={track.satellite.noradId ? `${track.satellite.name} · NORAD ${track.satellite.noradId}` : track.satellite.name}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_7px_currentColor]"
                      style={{ color: getTrackColor(track, index, visibleTracks.length), backgroundColor: "currentColor" }}
                    />
                    <span className="max-w-48 truncate">{track.satellite.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="relative mt-4 min-h-0 flex-1 overflow-hidden border border-cyan-300/15 bg-black/45">
              <GroundTrackSvg
                className={`h-full w-full transition duration-300 ${isRangeLoading ? "scale-[1.01] opacity-35 blur-[2px]" : "opacity-100"}`}
                currentById={currentById}
                selectedSatelliteIds={selectedSatelliteIds}
                visibleTracks={visibleTracks}
              />
              {isRangeLoading && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-[#02090d]/45 backdrop-blur-[1px]"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex min-w-64 flex-col items-center border border-cyan-300/25 bg-[#061015]/90 px-6 py-5 shadow-2xl">
                    <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-200" />
                    <span className="mt-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                      Generating ground tracks
                    </span>
                    <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      {rangeOptions.find((option) => option.id === selectedRangeId)?.label ?? "Selected range"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function GroundTrackSvg({
  className,
  currentById,
  selectedSatelliteIds,
  visibleTracks,
}: {
  className: string;
  currentById: Map<string, SatelliteSnapshot>;
  selectedSatelliteIds: string[];
  visibleTracks: SatelliteSnapshot[];
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${mapWidth} ${mapHeight}`}
      role="img"
      aria-label="2D satellite ground track map"
    >
      <defs>
        <linearGradient id="ground-map-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#071923" />
          <stop offset="55%" stopColor="#071016" />
          <stop offset="100%" stopColor="#020506" />
        </linearGradient>
      </defs>
      <rect width={mapWidth} height={mapHeight} fill="url(#ground-map-bg)" />
      <image
        href="/cesium/Assets/Textures/NaturalEarthII/0/0/0.jpg"
        x={0}
        y={0}
        width={mapWidth}
        height={mapHeight}
        preserveAspectRatio="none"
        opacity={0.62}
      />
      <rect width={mapWidth} height={mapHeight} fill="#020506" opacity={0.18} />

      {[-120, -60, 0, 60, 120].map((longitude) => {
        const x = ((longitude + 180) / 360) * mapWidth;
        return <line key={`lon-${longitude}`} x1={x} x2={x} y1={0} y2={mapHeight} stroke="rgba(103,232,249,0.14)" strokeWidth={0.7} />;
      })}
      {[-60, -30, 0, 30, 60].map((latitude) => {
        const y = ((90 - latitude) / 180) * mapHeight;
        return <line key={`lat-${latitude}`} x1={0} x2={mapWidth} y1={y} y2={y} stroke="rgba(103,232,249,0.14)" strokeWidth={0.7} />;
      })}
      <line x1={0} x2={mapWidth} y1={mapHeight / 2} y2={mapHeight / 2} stroke="rgba(132,204,22,0.28)" strokeWidth={1} />

      {/* Tracks are split at longitude wrap so date-line crossings do not draw across the whole map. */}
      {visibleTracks.map((snapshot, index) => {
        const color = getTrackColor(snapshot, index, visibleTracks.length);
        const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
        const segments = splitGroundTrackByLongitudeWrap(snapshot.groundTrack ?? []);

        return segments.map((segment, segmentIndex) => (
          <polyline
            key={`${snapshot.satellite.id}-${segmentIndex}`}
            points={buildPolylinePoints(segment)}
            fill="none"
            stroke={color}
            strokeOpacity={isSelected ? 0.95 : 0.55}
            strokeWidth={isSelected ? 0.8 : 0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ));
      })}

      {visibleTracks.map((track, index) => {
        const current = currentById.get(track.satellite.id);
        if (!current?.state) {
          return null;
        }

        const point = projectLatLon(current.state);
        const color = getTrackColor(track, index, visibleTracks.length);
        const isSelected = selectedSatelliteIds.includes(track.satellite.id);

        return (
          <g key={`current-${track.satellite.id}`}>
            <circle cx={point.x} cy={point.y} r={isSelected ? 4.4 : 3.2} fill={color} stroke="#ffffff" strokeWidth={1.2} />
            {isSelected && (
              <text
                x={Math.min(point.x + 7, mapWidth - 84)}
                y={Math.max(point.y - 7, 12)}
                fill="#e5fbff"
                fontFamily="monospace"
                fontSize="9"
                fontWeight="700"
              >
                {track.satellite.name.slice(0, 12)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
