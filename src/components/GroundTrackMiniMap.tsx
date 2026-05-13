"use client";

import { useMemo } from "react";
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

function getTrackColor(snapshot: SatelliteSnapshot, index: number) {
  return snapshot.satellite.visual.color ?? ["#63e6be", "#74c0fc", "#ffd43b", "#ff8787"][index % 4];
}

export function GroundTrackMiniMap({
  currentSnapshots,
  groundTrackSnapshots,
  selectedSatelliteIds,
  rangeLabel,
  onRangeChange,
  rangeOptions,
  selectedRangeId,
}: GroundTrackMiniMapProps) {
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
        <span className="font-mono text-xs text-lime-200">{visibleTracks.length}</span>
      </div>
      <select
        value={selectedRangeId}
        onChange={(event) => onRangeChange(event.target.value as GroundTrackRangeId)}
        className="mt-3 w-full border border-cyan-300/20 bg-black/45 px-3 py-2 font-mono text-[11px] uppercase text-cyan-100 outline-none transition focus:border-cyan-300"
        aria-label="Ground track time range"
      >
        {rangeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <svg
        className="mt-3 h-auto w-full overflow-hidden border border-cyan-300/15 bg-black/45"
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

        {[-120, -60, 0, 60, 120].map((longitude) => {
          const x = ((longitude + 180) / 360) * mapWidth;
          return <line key={`lon-${longitude}`} x1={x} x2={x} y1={0} y2={mapHeight} stroke="rgba(103,232,249,0.14)" strokeWidth={0.7} />;
        })}
        {[-60, -30, 0, 30, 60].map((latitude) => {
          const y = ((90 - latitude) / 180) * mapHeight;
          return <line key={`lat-${latitude}`} x1={0} x2={mapWidth} y1={y} y2={y} stroke="rgba(103,232,249,0.14)" strokeWidth={0.7} />;
        })}
        <line x1={0} x2={mapWidth} y1={mapHeight / 2} y2={mapHeight / 2} stroke="rgba(132,204,22,0.28)" strokeWidth={1} />

        {/* Tracks are split at longitude wrap so a date-line crossing does not draw across the whole map. */}
        {visibleTracks.map((snapshot, index) => {
          const color = getTrackColor(snapshot, index);
          const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
          const segments = splitGroundTrackByLongitudeWrap(snapshot.groundTrack ?? []);

          return segments.map((segment, segmentIndex) => (
            <polyline
              key={`${snapshot.satellite.id}-${segmentIndex}`}
              points={buildPolylinePoints(segment)}
              fill="none"
              stroke={color}
              strokeOpacity={isSelected ? 0.95 : 0.55}
              strokeWidth={isSelected ? 2 : 1.2}
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
          const color = getTrackColor(track, index);
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

      {visibleTracks.length === 0 && (
        <p className="mt-2 text-[11px] text-zinc-500">Enable Ground on a satellite to see its 2D surface path.</p>
      )}
      {selectedRangeId === "twoMonths" || selectedRangeId === "twoYears" ? (
        <p className="mt-2 text-[10px] leading-4 text-amber-100/70">
          Long history is sampled coarsely and is best treated as an approximate visual from the loaded TLE.
        </p>
      ) : null}
    </div>
  );
}
