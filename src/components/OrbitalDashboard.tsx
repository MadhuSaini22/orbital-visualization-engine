"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SatelliteObject, SatelliteSnapshot, SatelliteVisualSettings } from "@/domain/orbit";
import { GroundTrackMiniMap } from "@/components/GroundTrackMiniMap";
import type { GroundTrackRangeId, GroundTrackRangeOption } from "@/components/GroundTrackMiniMap";
import { sampleTle } from "@/data/sampleTle";
import { sampleManeuvers } from "@/data/sampleManeuvers";
import { sampleConjunctions } from "@/data/sampleConjunctions";
import type { ConjunctionEvent, ConjunctionSnapshot } from "@/domain/conjunction";
import { getConjunctionStatus, getConjunctionTone } from "@/domain/conjunction";
import type { ManeuverEvent, ManeuverSnapshot } from "@/domain/maneuver";
import { getDeltaVMagnitudeMps, getManeuverTone } from "@/domain/maneuver";
import { parseSatelliteSource } from "@/domain/satelliteConfig";
import { MAX_TLE_OBJECTS } from "@/domain/tle";
import { distanceBetweenOrbitStatesKm } from "@/geometry/distance";
import { formatNumber, formatUtc } from "@/geometry/format";
import { SatelliteJsPropagator } from "@/propagation/SatelliteJsPropagator";
import { fetchCatalogGroupTle, getOrbitServerDisplayUrl } from "@/services/orbitServerApi";
import { StateCacheService } from "@/services/StateCacheService";

const CesiumGlobe = dynamic(
  () => import("@/components/CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <div className="flex h-full min-h-[520px] items-center justify-center rounded-md bg-black text-sm text-zinc-400">Loading globe...</div>,
  },
);

type ManeuverFocusRequest = {
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeKm: number;
  sequence: number;
};
type FrameMode = "earth-fixed" | "inertial";

const sampleUrl = "/data/sample.tle";
const catalogGroupOptions = [
  { id: "STATIONS", label: "Stations" },
  { id: "ACTIVE", label: "Active" },
  { id: "WEATHER", label: "Weather" },
  { id: "GEO", label: "GEO" },
  { id: "SCIENCE", label: "Science" },
] as const;
type CatalogGroupId = (typeof catalogGroupOptions)[number]["id"];
const initialSimulationTime = new Date("2026-05-08T00:00:00.000Z");
const trajectoryOptions = {
  futureMinutes: 110,
  pastMinutes: 35,
  stepSec: 30,
};
const maneuverWindowMinutes = 45;
const conjunctionStepSec = 120;
const groundTrackRangeOptions = [
  {
    id: "live",
    label: "Live 6h",
    pastMinutes: 360,
    stepSec: 60,
    bucketMs: 60 * 1000,
  },
  {
    id: "day",
    label: "Last 24h",
    pastMinutes: 24 * 60,
    stepSec: 3 * 60,
    bucketMs: 10 * 60 * 1000,
  },
  {
    id: "week",
    label: "Last 7d",
    pastMinutes: 7 * 24 * 60,
    stepSec: 15 * 60,
    bucketMs: 60 * 60 * 1000,
  },
  {
    id: "twoMonths",
    label: "Last 2mo",
    pastMinutes: 60 * 24 * 60,
    stepSec: 60 * 60,
    bucketMs: 6 * 60 * 60 * 1000,
  },
  {
    id: "twoYears",
    label: "Last 2y",
    pastMinutes: 730 * 24 * 60,
    stepSec: 6 * 60 * 60,
    bucketMs: 24 * 60 * 60 * 1000,
  },
] satisfies Array<GroundTrackRangeOption & {
  pastMinutes: number;
  stepSec: number;
  bucketMs: number;
}>;

function isExternalEndpoint(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getTleFetchUrl(value: string) {
  const trimmed = value.trim();
  return isExternalEndpoint(trimmed) ? `/api/tle?url=${encodeURIComponent(trimmed)}` : trimmed;
}

function getInitialSelectedIds(satellites: SatelliteObject[]) {
  return satellites.slice(0, 1).map((satellite) => satellite.id);
}

function getFirstDifferentSatelliteId(satellites: SatelliteObject[], id: string) {
  return satellites.find((satellite) => satellite.id !== id)?.id ?? "";
}

function getRangePair(selectedSatelliteIds: string[]) {
  return {
    primaryId: selectedSatelliteIds[0] ?? "",
    secondaryId: selectedSatelliteIds[1] ?? "",
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function normalizeManeuverEvents(raw: unknown): ManeuverEvent[] {
  const maybeEvents = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "maneuvers" in raw && Array.isArray((raw as { maneuvers?: unknown }).maneuvers)
      ? (raw as { maneuvers: unknown[] }).maneuvers
      : [];

  return maybeEvents.flatMap((event): ManeuverEvent[] => {
    if (!event || typeof event !== "object") {
      return [];
    }

    const candidate = event as Partial<ManeuverEvent>;
    if (!candidate.id || !candidate.satelliteId || !candidate.title || !candidate.timeUtc) {
      return [];
    }

    return [{
      id: candidate.id,
      satelliteId: candidate.satelliteId,
      title: candidate.title,
      timeUtc: candidate.timeUtc,
      type: candidate.type ?? "station_keep",
      status: candidate.status ?? "candidate",
      deltaVMps: candidate.deltaVMps ?? getDeltaVMagnitudeMps({
        ...candidate,
        deltaVVectorMps: candidate.deltaVVectorMps ?? [0, 0, 0],
      } as ManeuverEvent),
      deltaVVectorMps: candidate.deltaVVectorMps ?? [0, candidate.deltaVMps ?? 0, 0],
      frame: candidate.frame ?? "RTN",
      durationSec: candidate.durationSec ?? 0,
      description: candidate.description ?? "Maneuver event loaded from JSON.",
      visual: {
        showBurnVector: candidate.visual?.showBurnVector ?? true,
        showPrePostOrbit: candidate.visual?.showPrePostOrbit ?? true,
      },
    }];
  });
}

function relativeVelocityKmps(a: SatelliteSnapshot["state"], b: SatelliteSnapshot["state"]) {
  if (!a?.velocityEciKmps || !b?.velocityEciKmps) {
    return null;
  }

  return Math.sqrt(
    (a.velocityEciKmps[0] - b.velocityEciKmps[0]) ** 2 +
    (a.velocityEciKmps[1] - b.velocityEciKmps[1]) ** 2 +
    (a.velocityEciKmps[2] - b.velocityEciKmps[2]) ** 2,
  );
}

export function OrbitalDashboard() {
  const [tleUrl, setTleUrl] = useState(sampleUrl);
  const [backendCatalogGroup, setBackendCatalogGroup] = useState<CatalogGroupId>("STATIONS");
  const initialParsed = useMemo(() => parseSatelliteSource(sampleTle), []);
  const initialSelectedSatelliteIds = useMemo(() => getInitialSelectedIds(initialParsed.satellites), [initialParsed.satellites]);
  const [satellites, setSatellites] = useState<SatelliteObject[]>(initialParsed.satellites);
  const [messages, setMessages] = useState<string[]>(initialParsed.errors);
  const [selectedSatelliteIds, setSelectedSatelliteIds] = useState<string[]>(initialSelectedSatelliteIds);
  const [simTime, setSimTime] = useState(() => initialSimulationTime);
  const [trajectoryAnchorTime, setTrajectoryAnchorTime] = useState(() => initialSimulationTime);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [frameMode, setFrameMode] = useState<FrameMode>("earth-fixed");
  const [showLabels, setShowLabels] = useState(true);
  const [showAllOrbits, setShowAllOrbits] = useState(false);
  const [showRangeCheck, setShowRangeCheck] = useState(false);
  const [groundTrackRangeId, setGroundTrackRangeId] = useState<GroundTrackRangeId>("live");
  const [showManeuvers, setShowManeuvers] = useState(false);
  const [maneuverEvents, setManeuverEvents] = useState<ManeuverEvent[]>(sampleManeuvers);
  const [selectedManeuverId, setSelectedManeuverId] = useState<string | null>(sampleManeuvers[0]?.id ?? null);
  const [isManeuverModalOpen, setIsManeuverModalOpen] = useState(false);
  const [showConjunctions, setShowConjunctions] = useState(false);
  const [conjunctionEvents] = useState<ConjunctionEvent[]>(sampleConjunctions);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState<string | null>(sampleConjunctions[0]?.id ?? null);
  const [resetSignal, setResetSignal] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ satelliteId: string; sequence: number } | null>(null);
  const [maneuverFocusRequest, setManeuverFocusRequest] = useState<ManeuverFocusRequest | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const propagator = useMemo(() => new SatelliteJsPropagator(satellites), [satellites]);
  const stateCache = useMemo(() => new StateCacheService(propagator, satellites), [propagator, satellites]);
  const groundTrackRange = groundTrackRangeOptions.find((option) => option.id === groundTrackRangeId) ?? groundTrackRangeOptions[0];
  const groundTrackAnchorMs = Math.floor(simTime.getTime() / groundTrackRange.bucketMs) * groundTrackRange.bucketMs;
  const snapshots: SatelliteSnapshot[] = useMemo(() => {
    return stateCache.getCurrentSnapshots(simTime.toISOString());
  }, [stateCache, simTime]);
  const orbitSnapshots: SatelliteSnapshot[] = useMemo(() => {
    return stateCache.getWindowedSnapshots(trajectoryAnchorTime.toISOString(), trajectoryOptions);
  }, [stateCache, trajectoryAnchorTime]);
  const groundTrackSnapshots: SatelliteSnapshot[] = useMemo(() => {
    return stateCache.getGroundTrackSnapshots(new Date(groundTrackAnchorMs).toISOString(), {
      pastMinutes: groundTrackRange.pastMinutes,
      stepSec: groundTrackRange.stepSec,
    });
  }, [groundTrackAnchorMs, groundTrackRange.pastMinutes, groundTrackRange.stepSec, stateCache]);
  const maneuverSnapshots: ManeuverSnapshot[] = useMemo(() => {
    return maneuverEvents.flatMap((event) => {
      const satellite = satellites.find((item) => item.id === event.satelliteId || item.noradId === event.satelliteId);
      if (!satellite) {
        return [];
      }
      const eventTime = new Date(event.timeUtc);

      return [{
        event,
        satellite,
        state: propagator.getState(satellite.id, event.timeUtc),
        preTrajectory: propagator.getTrajectory(
          satellite.id,
          addMinutes(eventTime, -maneuverWindowMinutes).toISOString(),
          event.timeUtc,
          90,
        ),
        postTrajectory: propagator.getTrajectory(
          satellite.id,
          event.timeUtc,
          addMinutes(eventTime, maneuverWindowMinutes).toISOString(),
          90,
        ),
        minutesFromSimulationTime: (new Date(event.timeUtc).getTime() - simTime.getTime()) / 60000,
      }];
    });
  }, [maneuverEvents, propagator, satellites, simTime]);
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId) ?? maneuverSnapshots[0] ?? null;
  const conjunctionSnapshots: ConjunctionSnapshot[] = useMemo(() => {
    return conjunctionEvents.flatMap((event): ConjunctionSnapshot[] => {
      const primary = satellites.find((item) => item.id === event.primarySatelliteId || item.noradId === event.primarySatelliteId);
      const secondary = satellites.find((item) => item.id === event.secondarySatelliteId || item.noradId === event.secondarySatelliteId);

      if (!primary || !secondary) {
        return [];
      }

      let best: ConjunctionSnapshot | null = null;
      const startMs = new Date(event.startTimeUtc).getTime();
      const endMs = new Date(event.endTimeUtc).getTime();

      for (let timeMs = startMs; timeMs <= endMs; timeMs += conjunctionStepSec * 1000) {
        const timeUtc = new Date(timeMs).toISOString();
        const primaryState = propagator.getState(primary.id, timeUtc);
        const secondaryState = propagator.getState(secondary.id, timeUtc);
        const missDistanceKm = distanceBetweenOrbitStatesKm(primaryState, secondaryState);

        if (missDistanceKm === null) {
          continue;
        }

        if (!best || missDistanceKm < best.missDistanceKm) {
          best = {
            event,
            primary,
            secondary,
            tcaUtc: timeUtc,
            missDistanceKm,
            relativeVelocityKmps: relativeVelocityKmps(primaryState, secondaryState),
            status: getConjunctionStatus(missDistanceKm, event.warningDistanceKm, event.criticalDistanceKm),
            primaryState,
            secondaryState,
          };
        }
      }

      return best ? [best] : [];
    });
  }, [conjunctionEvents, propagator, satellites]);
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;
  const latestSelectedId = selectedSatelliteIds.at(-1) ?? null;
  const selectedSnapshot = snapshots.find((item) => item.satellite.id === latestSelectedId) ?? snapshots[0];
  const currentDisplayGmstRadRaw = selectedSnapshot?.state?.gmstRad ?? snapshots.find((item) => item.state?.gmstRad)?.state?.gmstRad;
  // Orbit arcs are rendered in a space-like frame and rotated into Cesium's
  // Earth-fixed scene. Quantizing avoids rebuilding long polylines every
  // animation frame while keeping the marker visually seated on its orbit.
  const currentDisplayGmstRad = typeof currentDisplayGmstRadRaw === "number"
    ? Math.round(currentDisplayGmstRadRaw / 0.004) * 0.004
    : undefined;
  const validCount = snapshots.filter((item) => item.state).length;
  const { primaryId: rangePrimaryId, secondaryId: rangeSecondaryId } = getRangePair(selectedSatelliteIds);
  const primaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangePrimaryId);
  const secondaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangeSecondaryId);
  const rangeDistanceKm = distanceBetweenOrbitStatesKm(
    primaryRangeSnapshot?.state ?? null,
    secondaryRangeSnapshot?.state ?? null,
  );
  const rangeMeasurement =
    showRangeCheck && primaryRangeSnapshot && secondaryRangeSnapshot && rangeDistanceKm !== null
      ? {
          primary: primaryRangeSnapshot,
          secondary: secondaryRangeSnapshot,
          distanceKm: rangeDistanceKm,
        }
      : null;

  const loadTleText = useCallback((raw: string) => {
    const result = parseSatelliteSource(raw);
    const defaultSelectedIds = getInitialSelectedIds(result.satellites);
    setMessages(result.errors);
    setSatellites(result.satellites);
    setSelectedSatelliteIds(defaultSelectedIds);
    setTrajectoryAnchorTime(simTime);
    return result;
  }, [simTime]);

  const updateSatelliteVisual = useCallback((
    satelliteId: string,
    key: keyof SatelliteVisualSettings,
    value: boolean,
  ) => {
    setSatellites((current) =>
      current.map((satellite) =>
        satellite.id === satelliteId
          ? {
              ...satellite,
              visual: {
                ...satellite.visual,
                [key]: value,
              },
            }
          : satellite,
      ),
    );
  }, []);

  const keepSatelliteInSelection = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      if (current.includes(satelliteId)) {
        return current;
      }

      if (!showRangeCheck) {
        return [satelliteId];
      }

      if (current.length >= 2) {
        return [current[1], satelliteId];
      }

      return [...current, satelliteId];
    });
  }, [showRangeCheck]);

  const updateSatelliteLayer = useCallback((
    satelliteId: string,
    key: keyof SatelliteVisualSettings,
    value: boolean,
  ) => {
    updateSatelliteVisual(satelliteId, key, value);

    if (value && ["showOrbit", "showTrail", "showGroundTrack"].includes(key)) {
      keepSatelliteInSelection(satelliteId);
    }
  }, [keepSatelliteInSelection, updateSatelliteVisual]);

  const toggleSatelliteSelection = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      if (!showRangeCheck) {
        return [satelliteId];
      }

      if (current.includes(satelliteId)) {
        return current.filter((id) => id !== satelliteId);
      }

      if (current.length >= 2) {
        return [current[1], satelliteId];
      }

      return [...current, satelliteId];
    });
  }, [showRangeCheck]);

  const updateRangePrimary = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      const currentSecondaryId = current[1] && current[1] !== satelliteId
        ? current[1]
        : getFirstDifferentSatelliteId(satellites, satelliteId);

      return currentSecondaryId ? [satelliteId, currentSecondaryId] : [satelliteId];
    });
  }, [satellites]);

  const updateRangeSecondary = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      const currentPrimaryId = current[0] && current[0] !== satelliteId
        ? current[0]
        : getFirstDifferentSatelliteId(satellites, satelliteId);

      return currentPrimaryId ? [currentPrimaryId, satelliteId] : [satelliteId];
    });
  }, [satellites]);

  const toggleRangeCheck = useCallback(() => {
    if (showRangeCheck) {
      setSelectedSatelliteIds((selectedIds) => selectedIds.slice(-1));
    }
    setShowRangeCheck((current) => !current);
  }, [showRangeCheck]);

  const loadFromUrl = useCallback(async () => {
    const source = tleUrl.trim();
    if (!source) {
      setMessages(["Enter a TLE endpoint URL before loading."]);
      return;
    }

    setMessages([`Loading TLE data from ${source}...`]);
    try {
      const response = await fetch(getTleFetchUrl(source), { cache: "no-store" });
      if (!response.ok) {
        let message = `Request failed with ${response.status}`;
        try {
          const body = await response.json();
          if (typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // The endpoint may return plain text for non-JSON errors.
        }
        throw new Error(message);
      }
      loadTleText(await response.text());
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Unable to load TLE data from the URL."]);
      setSatellites([]);
      setSelectedSatelliteIds([]);
    }
  }, [loadTleText, tleUrl]);

  const loadFromBackendCatalog = useCallback(async () => {
    setMessages([`Loading ${backendCatalogGroup} satellites from backend server...`]);

    try {
      const rawTle = await fetchCatalogGroupTle(backendCatalogGroup, MAX_TLE_OBJECTS);
      const result = loadTleText(rawTle);
      setTleUrl(`server:${backendCatalogGroup.toLowerCase()}`);
      setMessages(
        result.errors.length > 0
          ? result.errors
          : [`Loaded ${result.satellites.length} satellites from backend group ${backendCatalogGroup}.`],
      );
    } catch (error) {
      setMessages([
        error instanceof Error
          ? error.message
          : "Unable to load satellites from the backend server.",
      ]);
    }
  }, [backendCatalogGroup, loadTleText]);

  const shiftSimulationTime = useCallback((minutes: number) => {
    setSimTime((current) => {
      const next = new Date(current.getTime() + minutes * 60 * 1000);
      setTrajectoryAnchorTime(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadManeuvers() {
      try {
        const response = await fetch("/data/maneuvers.json", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const parsed = normalizeManeuverEvents(await response.json());
        if (!ignore && parsed.length > 0) {
          setManeuverEvents(parsed);
          setSelectedManeuverId(parsed[0].id);
        }
      } catch {
        // The built-in TypeScript sample remains the fallback if JSON loading fails.
      }
    }

    loadManeuvers();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    lastTickRef.current = Date.now();
    let frameId = 0;

    function tick() {
      const now = Date.now();
      const elapsedMs = lastTickRef.current === null ? 0 : Math.min(now - lastTickRef.current, 250);
      lastTickRef.current = now;

      if (isPlaying && elapsedMs > 0) {
        setSimTime((current) => {
          const nextTime = current.getTime() + elapsedMs * speed;
          return nextTime === current.getTime() ? current : new Date(nextTime);
        });
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, speed]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
      <div className="absolute inset-0">
        <CesiumGlobe
          snapshots={snapshots}
          orbitSnapshots={orbitSnapshots}
          rangeMeasurement={rangeMeasurement}
          selectedSatelliteIds={selectedSatelliteIds}
          showAllOrbits={showAllOrbits}
          showLabels={showLabels}
          frameMode={frameMode}
          simTimeIso={simTime.toISOString()}
          currentGmstRad={currentDisplayGmstRad}
          focusRequest={focusRequest}
          maneuverFocusRequest={maneuverFocusRequest}
          maneuverSnapshots={maneuverSnapshots}
          selectedManeuverId={selectedManeuver?.event.id ?? null}
          showManeuvers={showManeuvers}
          conjunctionSnapshots={conjunctionSnapshots}
          selectedConjunctionId={selectedConjunction?.event.id ?? null}
          showConjunctions={showConjunctions}
          onSelectConjunction={setSelectedConjunctionId}
          onSelectManeuver={setSelectedManeuverId}
          onToggleSatellite={toggleSatelliteSelection}
          resetSignal={resetSignal}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.45)_100%)]" />

      <header className="pointer-events-auto absolute top-0 right-0 left-0 z-20 border-b border-cyan-300/20 bg-[#071016]/88 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase text-cyan-300">Phase 3 // Orbit Visualization Engine</p>
            <h1 className="text-xl font-semibold text-white">Multi-Satellite Orbital Operations</h1>
          </div>
          <div className="grid min-w-[520px] grid-cols-4 gap-3 max-lg:min-w-0 max-lg:flex-1 max-sm:grid-cols-2">
            <HudMetric label="Satellites" value={`${satellites.length}/${MAX_TLE_OBJECTS}`} />
            <HudMetric label="Visible" value={String(validCount)} />
            <HudMetric label="Range" value={showRangeCheck && rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "--"} />
            <HudMetric label="Speed" value={`${speed}x`} />
          </div>
        </div>
      </header>

      <section className="pointer-events-auto absolute top-24 left-4 z-20 w-[360px] max-w-[calc(100vw-2rem)] space-y-3 max-lg:relative max-lg:top-auto max-lg:left-auto max-lg:mt-24 max-lg:ml-4">
        <HudPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                {selectedSnapshot?.satellite.name ?? "No Target Lock"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">NORAD {selectedSnapshot?.satellite.noradId ?? selectedSnapshot?.satellite.id ?? "--"}</p>
            </div>
            <span className="border border-emerald-300/50 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-emerald-300">
              {selectedSnapshot ? "Tracking" : "Idle"}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
            <Telemetry label="Altitude" value={`${formatNumber(selectedSnapshot?.state?.altitudeKm)} km`} />
            <Telemetry label="Velocity" value={`${formatNumber((selectedSnapshot?.state?.velocityKmps ?? 0) * 3600)} km/h`} />
            <Telemetry label="Latitude" value={`${formatNumber(selectedSnapshot?.state?.latitudeDeg)} deg`} />
            <Telemetry label="Longitude" value={`${formatNumber(selectedSnapshot?.state?.longitudeDeg)} deg`} />
            <Telemetry label="Mission" value={selectedSnapshot?.satellite.metadata?.mission ?? "--"} />
            <Telemetry label="Source" value={selectedSnapshot?.satellite.sourceType ?? "--"} />
          </div>
        </HudPanel>

        <HudPanel>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Data Source</p>
          <div className="mt-3 flex gap-2">
            <input
              value={tleUrl}
              onChange={(event) => setTleUrl(event.target.value)}
              className="min-w-0 flex-1 border border-cyan-300/25 bg-black/45 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              placeholder="/data/satellites.json"
            />
            <button
              onClick={loadFromUrl}
              className="border border-cyan-300 bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Load
            </button>
          </div>
          <label className="mt-2 block cursor-pointer border border-dashed border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs text-zinc-300 transition hover:border-cyan-300/60">
            <input
              type="file"
              accept=".tle,.txt,.json"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  loadTleText(await file.text());
                }
              }}
            />
            Choose local TLE or JSON file
          </label>
          <div className="mt-3 border-t border-cyan-300/15 pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                Backend API
              </p>
              <span className="font-mono text-[10px] text-zinc-500">{getOrbitServerDisplayUrl()}</span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <select
                value={backendCatalogGroup}
                onChange={(event) => setBackendCatalogGroup(event.target.value as CatalogGroupId)}
                className="min-w-0 border border-cyan-300/25 bg-black/45 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              >
                {catalogGroupOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadFromBackendCatalog}
                className="border border-cyan-300/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950"
              >
                Load Server
              </button>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Calls Spring /api/catalog/tle and renders returned TLEs.
            </p>
          </div>
          {messages.length > 0 && (
            <div className="mt-3 border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </HudPanel>

        <GroundTrackMiniMap
          currentSnapshots={snapshots}
          groundTrackSnapshots={groundTrackSnapshots}
          selectedSatelliteIds={selectedSatelliteIds}
          rangeLabel={groundTrackRange.label}
          rangeOptions={groundTrackRangeOptions}
          selectedRangeId={groundTrackRangeId}
          onRangeChange={setGroundTrackRangeId}
        />
      </section>

      <section className="pointer-events-auto absolute top-24 right-4 bottom-4 z-20 w-[340px] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto pr-1 max-sm:hidden">
        <HudPanel>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Sat Filter</p>
            <button
              type="button"
              onClick={() => setShowAllOrbits((value) => !value)}
              className={`border px-3 py-1 font-mono text-[11px] uppercase transition ${
                showAllOrbits ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/30 text-cyan-200 hover:border-cyan-300"
              }`}
            >
              All Orbits
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-300">
            <span>{showRangeCheck ? "Selected range pair" : "Selected satellite"}</span>
            <span className="font-mono text-cyan-200">{selectedSatelliteIds.length}/{showRangeCheck ? 2 : 1}</span>
          </div>
          <div className="mt-3 max-h-[34vh] space-y-2 overflow-auto pr-1">
            {snapshots.map((snapshot) => (
              <SatelliteControl
                key={snapshot.satellite.id}
                snapshot={snapshot}
                isSelected={selectedSatelliteIds.includes(snapshot.satellite.id)}
                selectionIndex={selectedSatelliteIds.indexOf(snapshot.satellite.id)}
                onSelect={() => toggleSatelliteSelection(snapshot.satellite.id)}
                onFocus={() => {
                  keepSatelliteInSelection(snapshot.satellite.id);
                  setFocusRequest((request) => ({
                    satelliteId: snapshot.satellite.id,
                    sequence: (request?.sequence ?? 0) + 1,
                  }));
                }}
                onVisualChange={(key, checked) => updateSatelliteLayer(snapshot.satellite.id, key, checked)}
                onMarkerChange={(checked) => updateSatelliteVisual(snapshot.satellite.id, "showMarker", checked)}
                onLabelChange={(checked) => updateSatelliteVisual(snapshot.satellite.id, "showLabel", checked)}
              />
            ))}
          </div>
        </HudPanel>

        <HudPanel>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Range Check</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-cyan-100">{showRangeCheck && rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "--"}</span>
              <button
                type="button"
                aria-pressed={showRangeCheck}
                onClick={toggleRangeCheck}
                className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
                  showRangeCheck ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-500 hover:border-cyan-300"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${showRangeCheck ? "bg-cyan-300" : "bg-zinc-600"}`} />
                {showRangeCheck ? "On" : "Off"}
              </button>
            </div>
          </div>
          {!showRangeCheck ? (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Range is off. Globe clicks select one active satellite only.
            </p>
          ) : satellites.length < 2 ? (
            <p className="mt-3 text-xs text-zinc-500">Load at least 2 satellites.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              <select
                value={rangePrimaryId}
                onChange={(event) => updateRangePrimary(event.target.value)}
                className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              >
                {!rangePrimaryId && <option value="">Primary: Select satellite</option>}
                {satellites.map((satellite) => (
                  <option key={satellite.id} value={satellite.id}>Primary: {satellite.name}</option>
                ))}
              </select>
              <select
                value={rangeSecondaryId}
                onChange={(event) => updateRangeSecondary(event.target.value)}
                className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              >
                {!rangeSecondaryId && <option value="">Secondary: Select satellite</option>}
                {satellites.map((satellite) => (
                  <option key={satellite.id} value={satellite.id} disabled={satellite.id === rangePrimaryId}>
                    Secondary: {satellite.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </HudPanel>

        <ManeuverPanel
          maneuverSnapshots={maneuverSnapshots}
          selectedManeuverId={selectedManeuver?.event.id ?? null}
          showManeuvers={showManeuvers}
          onSelectManeuver={setSelectedManeuverId}
          onToggleManeuvers={() => setShowManeuvers((value) => !value)}
          onOpenManeuverModal={() => setIsManeuverModalOpen(true)}
        />

        <ConjunctionPanel
          conjunctionSnapshots={conjunctionSnapshots}
          selectedConjunctionId={selectedConjunction?.event.id ?? null}
          showConjunctions={showConjunctions}
          onSelectConjunction={setSelectedConjunctionId}
          onToggleConjunctions={() => setShowConjunctions((value) => !value)}
        />
      </section>

      <section className="pointer-events-auto absolute right-1/2 bottom-4 z-20 w-[min(900px,calc(100vw-2rem))] translate-x-1/2 border border-cyan-300/25 bg-[#071016]/88 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[240px] border-r border-cyan-300/20 pr-4 max-sm:border-r-0">
            <p className="font-mono text-[10px] uppercase text-zinc-500">Simulation Time</p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-100">{formatUtc(simTime)}</p>
          </div>
          <div className="border-r border-cyan-300/20 pr-4 max-sm:border-r-0">
            <p className="font-mono text-[10px] uppercase text-zinc-500">Frame</p>
            <div className="mt-1 grid grid-cols-2 border border-cyan-300/20">
              {[
                { id: "earth-fixed" as const, label: "Fixed" },
                { id: "inertial" as const, label: "Inertial" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFrameMode(item.id)}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                    frameMode === item.id
                      ? "bg-cyan-300 text-slate-950"
                      : "text-cyan-200 hover:bg-cyan-300/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ControlButton label="-10" onClick={() => shiftSimulationTime(-10)} />
            <ControlButton label="-1" onClick={() => shiftSimulationTime(-1)} />
            <button
              onClick={() => setIsPlaying((value) => !value)}
              className={`min-w-32 border px-5 py-2 font-mono text-sm font-semibold uppercase tracking-[0.18em] transition ${
                isPlaying ? "border-emerald-300 bg-emerald-300/10 text-emerald-200" : "border-cyan-300 bg-cyan-300 text-slate-950"
              }`}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <ControlButton label="+1" onClick={() => shiftSimulationTime(1)} />
            <ControlButton label="+10" onClick={() => shiftSimulationTime(10)} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {[60, 300, 600].map((item) => (
              <button
                key={item}
                onClick={() => setSpeed(item)}
                className={`border px-3 py-2 font-mono text-xs transition ${
                  speed === item ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/20 text-cyan-200 hover:border-cyan-300"
                }`}
              >
                {item}x
              </button>
            ))}
            <ControlButton
              label="Now"
              onClick={() => {
                const now = new Date();
                setSimTime(now);
                setTrajectoryAnchorTime(now);
              }}
            />
            <ControlButton label="Reset" onClick={() => setResetSignal((value) => value + 1)} />
          </div>
        </div>
      </section>

      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex flex-col gap-2 max-sm:hidden">
        <IconButton label="Home" onClick={() => setResetSignal((value) => value + 1)} />
        <IconButton label="Labels" active={showLabels} onClick={() => setShowLabels((value) => !value)} />
      </div>

      {isManeuverModalOpen && (
        <ManeuverModal
          maneuverSnapshots={maneuverSnapshots}
          selectedManeuverId={selectedManeuver?.event.id ?? null}
          onSelectManeuver={setSelectedManeuverId}
          onJumpToManeuver={(snapshot) => {
            setShowManeuvers(true);
            setSelectedManeuverId(snapshot.event.id);
            const eventTime = new Date(snapshot.event.timeUtc);
            setSimTime(eventTime);
            setTrajectoryAnchorTime(eventTime);
            setIsManeuverModalOpen(false);
            keepSatelliteInSelection(snapshot.satellite.id);
            const maneuverState = snapshot.state;
            if (maneuverState) {
              setManeuverFocusRequest((request) => ({
                longitudeDeg: maneuverState.longitudeDeg,
                latitudeDeg: maneuverState.latitudeDeg,
                altitudeKm: maneuverState.altitudeKm,
                sequence: (request?.sequence ?? 0) + 1,
              }));
            }
          }}
          onClose={() => setIsManeuverModalOpen(false)}
        />
      )}
    </main>
  );
}

function HudPanel({ children }: { children: ReactNode }) {
  return (
    <div className="border border-cyan-300/20 bg-[#071016]/82 p-4 shadow-2xl backdrop-blur-md">
      {children}
    </div>
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cyan-300/25 bg-black/30 px-4 py-2 text-center">
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className="font-mono text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Telemetry({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/55">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/55">{label}</p>
      <p className="mt-1 break-words font-mono text-xs font-semibold leading-5 text-zinc-100">{value}</p>
    </div>
  );
}

function ControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-cyan-300/20 px-3 py-2 font-mono text-xs text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-300/10"
    >
      {label}
    </button>
  );
}

function IconButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 w-12 border font-mono text-[10px] font-semibold uppercase transition ${
        active
          ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
          : "border-cyan-300/25 bg-[#071016]/82 text-cyan-300 hover:border-cyan-300"
      }`}
      title={label}
    >
      {label.slice(0, 2)}
    </button>
  );
}

function LayerToggle({
  label,
  title,
  tone = "cyan",
  checked,
  onChange,
}: {
  label: string;
  title?: string;
  tone?: "cyan" | "lime" | "zinc";
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const activeClass = tone === "lime"
    ? "border-lime-300 bg-lime-300/15 text-lime-100"
    : "border-cyan-300 bg-cyan-300/15 text-cyan-100";

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      title={title ?? label}
      className={`border px-2 py-1 font-mono text-[10px] uppercase transition ${
        checked
          ? activeClass
          : "border-white/10 text-zinc-500 hover:border-cyan-300/60 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function formatRelativeMinutes(minutes: number) {
  const absoluteMinutes = Math.abs(minutes);
  if (absoluteMinutes < 1) {
    return "now";
  }

  const value = absoluteMinutes >= 60
    ? `${formatNumber(absoluteMinutes / 60, 1)}h`
    : `${formatNumber(absoluteMinutes, 0)}m`;

  return minutes >= 0 ? `T+${value}` : `T-${value}`;
}

function getManeuverStatusDescription(status: ManeuverEvent["status"]) {
  if (status === "planned") {
    return "Planned means the burn is scheduled or approved, but has not happened yet.";
  }

  if (status === "candidate") {
    return "Candidate means this is a possible burn option being reviewed, not final.";
  }

  return "Executed means the burn already happened and is shown as historical context.";
}

function getConjunctionStatusDescription(status: ConjunctionSnapshot["status"]) {
  if (status === "critical") {
    return "Critical means the closest approach is inside the configured critical miss-distance threshold.";
  }

  if (status === "warning") {
    return "Warning means the satellites pass inside the warning threshold, but not inside the critical threshold.";
  }

  return "Safe means the closest approach stays outside the warning threshold in this sample window.";
}

function ManeuverPanel({
  maneuverSnapshots,
  selectedManeuverId,
  showManeuvers,
  onSelectManeuver,
  onToggleManeuvers,
  onOpenManeuverModal,
}: {
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  showManeuvers: boolean;
  onSelectManeuver: (maneuverId: string) => void;
  onToggleManeuvers: () => void;
  onOpenManeuverModal: () => void;
}) {
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId);
  const handleToggleManeuvers = () => {
    if (!showManeuvers && !selectedManeuverId && maneuverSnapshots[0]) {
      onSelectManeuver(maneuverSnapshots[0].event.id);
    }

    onToggleManeuvers();
  };

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Maneuvers</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showManeuvers}
            onClick={handleToggleManeuvers}
            className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
              showManeuvers ? "border-fuchsia-300 bg-fuchsia-300/15 text-fuchsia-100" : "border-white/10 text-zinc-500 hover:border-fuchsia-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${showManeuvers ? "bg-fuchsia-300" : "bg-zinc-600"}`} />
            {showManeuvers ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={onOpenManeuverModal}
            className="grid h-8 w-8 place-items-center border border-fuchsia-300/35 text-fuchsia-100 transition hover:border-fuchsia-300 hover:bg-fuchsia-300/10"
            aria-label="Open maneuver details"
            title="Open maneuver details"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {showManeuvers ? `${maneuverSnapshots.length} event markers visible` : "Enable to show maneuver markers and event details."}
      </p>
      {showManeuvers && selectedManeuver && (
        <button
          type="button"
          onClick={onOpenManeuverModal}
          className="mt-3 w-full border border-fuchsia-300/25 bg-fuchsia-300/5 px-3 py-2 text-left transition hover:border-fuchsia-300/60"
        >
          <span className="block text-xs font-semibold text-white">{selectedManeuver.event.title}</span>
          <span className="mt-1 flex items-center justify-between font-mono text-[11px] text-zinc-400">
            <span>{selectedManeuver.satellite.name}</span>
            <span>{formatNumber(selectedManeuver.event.deltaVMps, 2)} m/s</span>
          </span>
        </button>
      )}
    </HudPanel>
  );
}

function ManeuverModal({
  maneuverSnapshots,
  selectedManeuverId,
  onSelectManeuver,
  onJumpToManeuver,
  onClose,
}: {
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  onSelectManeuver: (maneuverId: string) => void;
  onJumpToManeuver: (snapshot: ManeuverSnapshot) => void;
  onClose: () => void;
}) {
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId) ?? maneuverSnapshots[0] ?? null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex h-[75vh] w-[min(1180px,75vw)] flex-col border border-fuchsia-300/35 bg-[#071016]/95 shadow-2xl max-lg:w-[94vw]">
        <div className="flex items-center justify-between border-b border-fuchsia-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Phase 2 Maneuver Visualization</p>
            <h2 className="text-xl font-semibold text-white">Maneuver Events</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-fuchsia-300 hover:text-white"
            aria-label="Close maneuver modal"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] gap-4 overflow-hidden p-5 max-lg:grid-cols-1">
          <div className="min-h-0 overflow-auto border border-white/10 bg-black/25 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Event Timeline</p>
            <div className="mt-3 space-y-2">
              {maneuverSnapshots.map((snapshot) => {
                const tone = getManeuverTone(snapshot.event.status);
                const isSelected = selectedManeuver?.event.id === snapshot.event.id;

                return (
                  <button
                    key={snapshot.event.id}
                    type="button"
                    onClick={() => onSelectManeuver(snapshot.event.id)}
                    className={`w-full border p-3 text-left transition ${
                      isSelected ? "border-fuchsia-300 bg-fuchsia-300/10" : "border-white/10 bg-black/30 hover:border-fuchsia-300/45"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold text-white">{snapshot.event.title}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{snapshot.satellite.name}</span>
                      </span>
                      <span
                        className="border px-2 py-0.5 font-mono text-[10px]"
                        style={{ borderColor: tone.color, color: tone.color }}
                        title={getManeuverStatusDescription(snapshot.event.status)}
                      >
                        {tone.label}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
                      <span>{formatRelativeMinutes(snapshot.minutesFromSimulationTime)}</span>
                      <span>{formatNumber(snapshot.event.deltaVMps, 2)} m/s</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedManeuver ? (
            <div className="min-h-0 overflow-auto border border-white/10 bg-black/25 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-fuchsia-200">Selected Maneuver</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{selectedManeuver.event.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{selectedManeuver.event.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onJumpToManeuver(selectedManeuver)}
                  className="border border-fuchsia-300 bg-fuchsia-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-fuchsia-100 transition hover:bg-fuchsia-300 hover:text-slate-950"
                >
                  Jump To Burn
                </button>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-3 max-xl:grid-cols-2">
                <ManeuverMetric label="Satellite" value={selectedManeuver.satellite.name} />
                <ManeuverMetric
                  label="Status"
                  value={getManeuverTone(selectedManeuver.event.status).label}
                  title={getManeuverStatusDescription(selectedManeuver.event.status)}
                />
                <ManeuverMetric label="Type" value={selectedManeuver.event.type.replaceAll("_", " ")} />
                <ManeuverMetric label="Burn Duration" value={`${selectedManeuver.event.durationSec}s`} />
                <ManeuverMetric label="Event Time" value={formatUtc(new Date(selectedManeuver.event.timeUtc))} />
                <ManeuverMetric label="Relative Time" value={formatRelativeMinutes(selectedManeuver.minutesFromSimulationTime)} />
                <ManeuverMetric label="Altitude" value={`${formatNumber(selectedManeuver.state?.altitudeKm)} km`} />
                <ManeuverMetric label="Delta-V" value={`${formatNumber(selectedManeuver.event.deltaVMps, 2)} m/s`} />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <div className="border border-white/10 bg-black/30 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Delta-V Vector</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    RTN means Radial, Along-track, Cross-track. These values show the planned burn direction components.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {["R", "T", "N"].map((axis, index) => (
                      <div key={axis} className="border border-white/10 bg-black/35 p-3">
                        <p className="font-mono text-[10px] text-zinc-500">{axis}</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-white">{formatNumber(selectedManeuver.event.deltaVVectorMps[index], 2)} m/s</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/30 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Visual Layers</p>
                  <div className="mt-3 space-y-3 text-sm text-zinc-300">
                    <p>Burn marker: magenta event point on the globe.</p>
                    <p>Vector: arrow from burn point showing the planned direction.</p>
                    <p>Only the selected maneuver shows a burn vector. Other events stay as markers to keep the globe readable.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center border border-white/10 bg-black/25 text-sm text-zinc-500">No maneuver events loaded.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ManeuverMetric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="border border-white/10 bg-black/30 p-3" title={title}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300/60">{label}</p>
      <p className="mt-2 break-words font-mono text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ConjunctionPanel({
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  onSelectConjunction,
  onToggleConjunctions,
}: {
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  onSelectConjunction: (conjunctionId: string) => void;
  onToggleConjunctions: () => void;
}) {
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Conjunctions</p>
        <button
          type="button"
          aria-pressed={showConjunctions}
          onClick={onToggleConjunctions}
          className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
            showConjunctions ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/10 text-zinc-500 hover:border-amber-300"
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${showConjunctions ? "bg-amber-300" : "bg-zinc-600"}`} />
          {showConjunctions ? "On" : "Off"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {showConjunctions ? `${conjunctionSnapshots.length} close-approach pair visible` : "Enable to show close-approach links and risk labels."}
      </p>
      {showConjunctions && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Conjunction = a close-approach check between two satellites. TCA is the time when that pair is closest in the sample window.
        </p>
      )}

      {showConjunctions && (
        <div className="mt-3 space-y-2">
          {conjunctionSnapshots.map((snapshot) => {
            const tone = getConjunctionTone(snapshot.status);
            const isSelected = selectedConjunction?.event.id === snapshot.event.id;

            return (
              <button
                key={snapshot.event.id}
                type="button"
                onClick={() => onSelectConjunction(snapshot.event.id)}
                className={`w-full border p-3 text-left transition ${
                  isSelected ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-black/30 hover:border-amber-300/45"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{snapshot.primary.name} / {snapshot.secondary.name}</span>
                  <span
                    className="border px-2 py-0.5 font-mono text-[10px]"
                    style={{ borderColor: tone.color, color: tone.color }}
                    title={getConjunctionStatusDescription(snapshot.status)}
                  >
                    {tone.label}
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
                  <span>{formatNumber(snapshot.missDistanceKm, 1)} km</span>
                  <span>{snapshot.relativeVelocityKmps === null ? "--" : formatNumber(snapshot.relativeVelocityKmps, 2)} km/s</span>
                </span>
              </button>
            );
          })}
          {selectedConjunction && (
            <div className="border border-white/10 bg-black/35 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200">TCA Summary</p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Time of Closest Approach for the selected satellite pair.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <DetailMetric label="Closest Time" value={formatUtc(new Date(selectedConjunction.tcaUtc))} />
                <DetailMetric label="Miss Distance" value={`${formatNumber(selectedConjunction.missDistanceKm, 1)} km`} />
                <DetailMetric
                  label="Rel Velocity"
                  value={`${selectedConjunction.relativeVelocityKmps === null ? "--" : formatNumber(selectedConjunction.relativeVelocityKmps, 2)} km/s`}
                />
                <DetailMetric label="Risk" value={getConjunctionTone(selectedConjunction.status).label} />
              </div>
            </div>
          )}
        </div>
      )}
    </HudPanel>
  );
}

function SatelliteControl({
  snapshot,
  isSelected,
  selectionIndex,
  onSelect,
  onFocus,
  onVisualChange,
  onMarkerChange,
  onLabelChange,
}: {
  snapshot: SatelliteSnapshot;
  isSelected: boolean;
  selectionIndex: number;
  onSelect: () => void;
  onFocus: () => void;
  onVisualChange: (key: "showOrbit" | "showTrail" | "showGroundTrack", checked: boolean) => void;
  onMarkerChange: (checked: boolean) => void;
  onLabelChange: (checked: boolean) => void;
}) {
  return (
    <div className={`border p-3 transition ${isSelected ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/30 hover:border-cyan-300/35"}`}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">{snapshot.satellite.name}</span>
          {isSelected && (
            <span className="border border-cyan-300/40 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
              SAT {selectionIndex + 1}
            </span>
          )}
        </span>
        <span className="mt-1 block font-mono text-[11px] text-zinc-500">
          NORAD {snapshot.satellite.noradId ?? snapshot.satellite.id}
        </span>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <LayerToggle
          label="Orbit"
          title="Stable orbit arc built from propagated Cartesian state, not lat/lon ground samples."
          checked={snapshot.satellite.visual.showOrbit}
          onChange={(checked) => onVisualChange("showOrbit", checked)}
        />
        <LayerToggle label="Trail" checked={snapshot.satellite.visual.showTrail} onChange={(checked) => onVisualChange("showTrail", checked)} />
        <LayerToggle label="Ground" tone="lime" checked={snapshot.satellite.visual.showGroundTrack} onChange={(checked) => onVisualChange("showGroundTrack", checked)} />
      </div>
      {(snapshot.satellite.visual.showTrail || snapshot.satellite.visual.showGroundTrack) && (
        <p className="mt-2 font-mono text-[10px] leading-4 text-zinc-500">
          Orbit = stable space arc, Trail = recent space history, Ground = surface trace
        </p>
      )}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <LayerToggle label="Dot" tone="zinc" checked={snapshot.satellite.visual.showMarker} onChange={onMarkerChange} />
        <LayerToggle label="Name" tone="zinc" checked={snapshot.satellite.visual.showLabel} onChange={onLabelChange} />
        <button
          type="button"
          onClick={onFocus}
          className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
        >
          Focus
        </button>
      </div>
    </div>
  );
}
