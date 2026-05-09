"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import { sampleTle } from "@/data/sampleTle";
import { MAX_TLE_OBJECTS, parseTleText } from "@/domain/tle";
import { distanceBetweenOrbitStatesKm } from "@/geometry/distance";
import { formatNumber, formatUtc } from "@/geometry/format";
import { SatelliteJsPropagator } from "@/propagation/SatelliteJsPropagator";

const CesiumGlobe = dynamic(
  () => import("@/components/CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <div className="flex h-full min-h-[520px] items-center justify-center rounded-md bg-black text-sm text-zinc-400">Loading globe...</div>,
  },
);

const sampleUrl = "/data/sample.tle";
const initialSimulationTime = new Date("2026-05-08T00:00:00.000Z");

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

export function OrbitalDashboard() {
  const [tleUrl, setTleUrl] = useState(sampleUrl);
  const initialParsed = useMemo(() => parseTleText(sampleTle), []);
  const initialSelectedSatelliteIds = useMemo(() => getInitialSelectedIds(initialParsed.satellites), [initialParsed.satellites]);
  const [satellites, setSatellites] = useState<SatelliteObject[]>(initialParsed.satellites);
  const [messages, setMessages] = useState<string[]>(initialParsed.errors);
  const [selectedSatelliteIds, setSelectedSatelliteIds] = useState<string[]>(initialSelectedSatelliteIds);
  const [simTime, setSimTime] = useState(() => initialSimulationTime);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [showLabels, setShowLabels] = useState(true);
  const [showAllOrbits, setShowAllOrbits] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const lastTickRef = useRef<number | null>(null);

  const propagator = useMemo(() => new SatelliteJsPropagator(satellites), [satellites]);
  const snapshots: SatelliteSnapshot[] = useMemo(() => {
    const timeUtc = simTime.toISOString();
    return satellites.map((satellite) => {
      const state = propagator.getState(satellite.id, timeUtc);
      return {
        satellite,
        state,
        error: state ? undefined : "No propagated position for this time.",
      };
    });
  }, [propagator, satellites, simTime]);
  const orbitSnapshots: SatelliteSnapshot[] = useMemo(() => {
    const startUtc = initialSimulationTime.toISOString();
    const endUtc = new Date(initialSimulationTime.getTime() + 110 * 60 * 1000).toISOString();

    return satellites.map((satellite) => ({
      satellite,
      state: null,
      trajectory: propagator.getTrajectory(satellite.id, startUtc, endUtc, 60),
    }));
  }, [propagator, satellites]);
  const latestSelectedId = selectedSatelliteIds.at(-1) ?? null;
  const selectedSnapshot = snapshots.find((item) => item.satellite.id === latestSelectedId) ?? snapshots[0];
  const validCount = snapshots.filter((item) => item.state).length;
  const { primaryId: rangePrimaryId, secondaryId: rangeSecondaryId } = getRangePair(selectedSatelliteIds);
  const primaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangePrimaryId);
  const secondaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangeSecondaryId);
  const rangeDistanceKm = distanceBetweenOrbitStatesKm(
    primaryRangeSnapshot?.state ?? null,
    secondaryRangeSnapshot?.state ?? null,
  );
  const rangeMeasurement =
    primaryRangeSnapshot && secondaryRangeSnapshot && rangeDistanceKm !== null
      ? {
          primary: primaryRangeSnapshot,
          secondary: secondaryRangeSnapshot,
          distanceKm: rangeDistanceKm,
        }
      : null;

  const loadTleText = useCallback((raw: string) => {
    const result = parseTleText(raw);
    const defaultSelectedIds = getInitialSelectedIds(result.satellites);
    setMessages(result.errors);
    setSatellites(result.satellites);
    setSelectedSatelliteIds(defaultSelectedIds);
  }, []);

  const toggleSatelliteSelection = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      if (current.includes(satelliteId)) {
        return current.filter((id) => id !== satelliteId);
      }

      if (current.length >= 2) {
        return [current[1], satelliteId];
      }

      return [...current, satelliteId];
    });
  }, []);

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

  useEffect(() => {
    let frameId = 0;

    function tick(now: number) {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }

      const elapsedMs = now - lastTickRef.current;
      lastTickRef.current = now;

      if (isPlaying) {
        setSimTime((current) => new Date(current.getTime() + elapsedMs * speed));
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, speed]);

  return (
    <main className="min-h-screen bg-[#090b10] text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-white/10 bg-[#11151d] p-5 lg:border-r lg:border-b-0">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Phase 0</p>
            <h1 className="text-2xl font-semibold text-white">Orbital Viewer</h1>
            <p className="text-sm leading-6 text-zinc-400">
              Load up to {MAX_TLE_OBJECTS} TLE objects from a TLE endpoint, inspect satellites, and view orbit arcs.
            </p>
          </div>

          <section className="mt-6 space-y-3">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">TLE endpoint</label>
            <div className="flex gap-2">
              <input
                value={tleUrl}
                onChange={(event) => setTleUrl(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                placeholder="https://celestrak.org/NORAD/elements/gp.php?CATNR=25544"
              />
              <button
                onClick={loadFromUrl}
                className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Load
              </button>
            </div>

            <label className="block rounded-md border border-dashed border-white/15 bg-black/20 px-3 py-3 text-sm text-zinc-300 transition hover:border-cyan-300/60">
              <input
                type="file"
                accept=".tle,.txt"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    loadTleText(await file.text());
                  }
                }}
              />
              Choose local TLE file
            </label>
          </section>

          {messages.length > 0 && (
            <section className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-3 text-sm text-amber-100">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </section>
          )}

          <section className="mt-6 grid grid-cols-3 gap-2">
            <Metric label="Loaded" value={String(satellites.length)} />
            <Metric label="Visible" value={String(validCount)} />
            <Metric label="Speed" value={`${speed}x`} />
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Simulation</label>
              <span className="font-mono text-xs text-zinc-400">{formatUtc(simTime)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setIsPlaying((value) => !value)}
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-zinc-200"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={() => setSimTime(new Date())}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/30"
              >
                Now
              </button>
              <button
                onClick={() => setResetSignal((value) => value + 1)}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-white/30"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 10, 60, 300].map((item) => (
                <button
                  key={item}
                  onClick={() => setSpeed(item)}
                  className={`rounded-md px-3 py-2 text-sm transition ${
                    speed === item ? "bg-cyan-300 text-slate-950" : "border border-white/10 text-zinc-300 hover:border-white/30"
                  }`}
                >
                  {item}x
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300">
              Satellite labels
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(event) => setShowLabels(event.target.checked)}
                className="h-4 w-4 accent-cyan-300"
              />
            </label>
            <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300">
              Selected orbits
              <span className="font-mono text-xs text-cyan-200">{selectedSatelliteIds.length}/2</span>
            </div>
            <label className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300">
              Show all orbits
              <input
                type="checkbox"
                checked={showAllOrbits}
                onChange={(event) => setShowAllOrbits(event.target.checked)}
                className="h-4 w-4 accent-cyan-300"
              />
            </label>
          </section>

          <section className="mt-6 space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Range check</label>
              <span className="rounded bg-cyan-300/10 px-2 py-1 font-mono text-xs text-cyan-200">
                {rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "--"}
              </span>
            </div>

            {satellites.length < 2 ? (
              <p className="text-sm leading-5 text-zinc-400">Load at least 2 satellites to calculate distance.</p>
            ) : (
              <>
                <div className="grid gap-2">
                  <select
                    value={rangePrimaryId}
                    onChange={(event) => updateRangePrimary(event.target.value)}
                    className="rounded-md border border-white/10 bg-[#11151d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                  >
                    {!rangePrimaryId && <option value="">Primary: Select satellite</option>}
                    {satellites.map((satellite) => (
                      <option key={satellite.id} value={satellite.id}>
                        Primary: {satellite.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rangeSecondaryId}
                    onChange={(event) => updateRangeSecondary(event.target.value)}
                    className="rounded-md border border-white/10 bg-[#11151d] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                  >
                    {!rangeSecondaryId && <option value="">Secondary: Select satellite</option>}
                    {satellites.map((satellite) => (
                      <option key={satellite.id} value={satellite.id} disabled={satellite.id === rangePrimaryId}>
                        Secondary: {satellite.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs leading-5 text-zinc-500">
                  Click satellites on the globe or list to toggle their orbit. Distance appears when 2 are selected.
                </p>
              </>
            )}
          </section>

          <section className="mt-6 space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Satellites</label>
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {snapshots.map((snapshot) => (
                <button
                  key={snapshot.satellite.id}
                  onClick={() => toggleSatelliteSelection(snapshot.satellite.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    selectedSatelliteIds.includes(snapshot.satellite.id)
                      ? "border-cyan-300 bg-cyan-300/10"
                      : "border-white/10 bg-black/20 hover:border-white/30"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-white">
                    {snapshot.satellite.name}
                    {selectedSatelliteIds.includes(snapshot.satellite.id) && (
                      <span className="rounded bg-cyan-300/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200">
                        SAT {selectedSatelliteIds.indexOf(snapshot.satellite.id) + 1}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-zinc-500">NORAD {snapshot.satellite.id}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[640px] flex-col p-4 lg:p-5">
          <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-md border border-white/10 bg-black shadow-2xl">
            <CesiumGlobe
              snapshots={snapshots}
              orbitSnapshots={orbitSnapshots}
              rangeMeasurement={rangeMeasurement}
              selectedSatelliteIds={selectedSatelliteIds}
              showAllOrbits={showAllOrbits}
              showLabels={showLabels}
              onToggleSatellite={toggleSatelliteSelection}
              resetSignal={resetSignal}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Detail label="Selected" value={selectedSnapshot?.satellite.name ?? "--"} />
            <Detail label="Latitude" value={`${formatNumber(selectedSnapshot?.state?.latitudeDeg)} deg`} />
            <Detail label="Longitude" value={`${formatNumber(selectedSnapshot?.state?.longitudeDeg)} deg`} />
            <Detail label="Altitude" value={`${formatNumber(selectedSnapshot?.state?.altitudeKm)} km`} />
            <Detail label="Velocity" value={`${formatNumber(selectedSnapshot?.state?.velocityKmps)} km/s`} />
            <Detail label="Frame" value={selectedSnapshot?.state?.frame ?? "--"} />
            <Detail label="Objects cap" value={`${MAX_TLE_OBJECTS} max`} />
            <Detail label="Source entries" value={`${satellites.length} loaded`} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-mono text-lg text-white">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#11151d] px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-zinc-100">{value}</p>
    </div>
  );
}
