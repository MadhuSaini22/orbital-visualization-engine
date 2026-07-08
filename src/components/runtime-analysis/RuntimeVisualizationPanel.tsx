"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { CesiumRenderModel, GroundStationVisualizationModel } from "@/domain/visualization";
import type { OrbitState, SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import type { RuntimePropagationResponse } from "@/services/orbitServerApi";
import { EmptyState } from "@/components/runtime-analysis/runtime-components/EmptyState";
import { LoadingOverlay } from "@/components/runtime-analysis/runtime-components/LoadingOverlay";

const CesiumGlobe = dynamic(
  () => import("@/components/CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <div className="grid h-full min-h-[420px] place-items-center bg-black text-sm text-zinc-500">Loading viewer...</div>,
  },
);

const emptyGroundStationVisualization: GroundStationVisualizationModel = {
  markers: [],
  satelliteFootprint: null,
  stationAccessRegions: [],
  contactLines: [],
};

export function RuntimeVisualizationPanel({ propagation, loading, fallbackNorad }: { propagation: RuntimePropagationResponse | null; loading: boolean; fallbackNorad: string }) {
  const renderModel = useMemo(() => buildRuntimeRenderModel(propagation, fallbackNorad), [fallbackNorad, propagation]);

  return (
    <section className="relative min-h-[420px] border-r border-cyan-300/15 bg-black max-xl:border-r-0 max-xl:border-b">
      <div className="absolute top-3 left-3 z-10 border border-cyan-300/20 bg-black/60 px-3 py-2 backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">3D Orbit Viewer</p>
        <p className="mt-1 text-xs text-zinc-400">{propagation ? `${propagation.states.length} propagated states` : "Run propagation to draw trajectory"}</p>
      </div>
      {propagation ? (
        <CesiumGlobe
          renderModel={renderModel}
          frameMode="earth-fixed"
          simTimeIso={propagation.states[0]?.timestamp ?? new Date().toISOString()}
          isPlaying={false}
          simulationSpeed={1}
          focusRequest={null}
          maneuverFocusRequest={null}
          onSelectConjunction={() => undefined}
          onSelectManeuver={() => undefined}
          onToggleSatellite={() => undefined}
          resetSignal={0}
          onClockTick={() => undefined}
        />
      ) : (
        <EmptyState title="No runtime trajectory" detail="Run Orbit Propagation to populate the shared Cesium viewer." />
      )}
      {loading && <LoadingOverlay />}
    </section>
  );
}

function vectorMagnitudeMeters(vector: { xMeters: number; yMeters: number; zMeters: number }) {
  return Math.sqrt(vector.xMeters ** 2 + vector.yMeters ** 2 + vector.zMeters ** 2);
}

function runtimeStateToOrbitState(satelliteId: string, state: { timestamp: string; position: { xMeters: number; yMeters: number; zMeters: number }; velocity: { xMeters: number; yMeters: number; zMeters: number } }): OrbitState {
  const xKm = state.position.xMeters / 1000;
  const yKm = state.position.yMeters / 1000;
  const zKm = state.position.zMeters / 1000;
  const radiusKm = Math.max(1, Math.sqrt(xKm ** 2 + yKm ** 2 + zKm ** 2));
  return {
    satelliteId,
    timeUtc: state.timestamp,
    frame: "ECEF",
    positionEcefKm: [xKm, yKm, zKm],
    velocityEcefKmps: [state.velocity.xMeters / 1000, state.velocity.yMeters / 1000, state.velocity.zMeters / 1000],
    latitudeDeg: Math.asin(zKm / radiusKm) * 180 / Math.PI,
    longitudeDeg: Math.atan2(yKm, xKm) * 180 / Math.PI,
    altitudeKm: radiusKm - 6378.137,
    velocityKmps: vectorMagnitudeMeters(state.velocity) / 1000,
  };
}

function buildRuntimeRenderModel(propagation: RuntimePropagationResponse | null, fallbackNorad: string): CesiumRenderModel {
  const states = propagation?.states ?? [];
  const satelliteId = `runtime-${propagation?.satellite.catalogSatellite.noradCatalogId ?? fallbackNorad}`;
  const satellite: SatelliteObject = {
    id: satelliteId,
    name: propagation?.satellite.catalogSatellite.objectName ?? `Runtime ${fallbackNorad}`,
    noradId: String(propagation?.satellite.catalogSatellite.noradCatalogId ?? fallbackNorad),
    sourceType: "EPHEMERIS",
    visual: { showMarker: true, showLabel: true, showOrbit: true, showGroundTrack: false, showTrail: true, color: "#67e8f9" },
    metadata: { mission: "runtime analysis", objectType: "payload" },
  };
  const trajectory = states.map((state) => runtimeStateToOrbitState(satelliteId, state));
  const snapshot: SatelliteSnapshot = { satellite, state: trajectory[0] ?? null, trajectory, futureTrajectory: trajectory, pastTrail: trajectory };
  const snapshots = propagation ? [snapshot] : [];
  return {
    snapshots,
    orbitSnapshots: snapshots,
    orbitPathSnapshots: snapshots,
    trailSnapshots: snapshots,
    groundTrackSnapshots: [],
    rangeMeasurement: null,
    selectedSatelliteIds: snapshots.map((item) => item.satellite.id),
    showAllOrbits: true,
    showLabels: true,
    maneuverSnapshots: [],
    selectedManeuverId: null,
    showManeuvers: false,
    conjunctionSnapshots: [],
    selectedConjunctionId: null,
    showConjunctions: false,
    groundStationVisualization: emptyGroundStationVisualization,
    groundOperationsGroundTrackSnapshot: null,
  };
}
