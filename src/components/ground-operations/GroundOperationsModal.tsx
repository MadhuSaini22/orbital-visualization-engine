"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GroundOperationsAnalysis, GroundStation, GroundStationNetwork } from "@/domain/groundOperations";
import type { SatelliteSnapshot } from "@/domain/orbit";
import { groundStationCatalog, groundStationNetworks } from "@/data/groundStationCatalog";
import { formatNumber } from "@/geometry/format";
import { GroundOperationsService } from "@/services/GroundOperationsService";
import { compactIsoUtc, secondsToDurationLabel } from "@/components/mission-planning/utils";

type GroundStationDraft = {
  name: string;
  latitude: string;
  longitude: string;
  altitude: string;
  minimumElevation: string;
  network: GroundStationNetwork;
};

export type GroundOpsHorizonId = "ONE_ORBIT" | "THREE_ORBITS" | "SIX_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";

export type GroundOpsHorizon = {
  id: GroundOpsHorizonId;
  customHours: string;
};

export type GroundStationDisplayOptions = {
  stations: boolean;
  footprints: boolean;
  contactLines: boolean;
};

export const groundOpsHorizonOptions = [
  { id: "ONE_ORBIT", label: "1 Orbit", hours: 1.55 },
  { id: "THREE_ORBITS", label: "3 Orbits", hours: 4.65 },
  { id: "SIX_HOURS", label: "6 Hours", hours: 6 },
  { id: "TWELVE_HOURS", label: "12 Hours", hours: 12 },
  { id: "TWENTY_FOUR_HOURS", label: "24 Hours", hours: 24 },
  { id: "CUSTOM", label: "Custom", hours: null },
] satisfies Array<{ id: GroundOpsHorizonId; label: string; hours: number | null }>;

const defaultDraft: GroundStationDraft = {
  name: "Custom Ground Station",
  latitude: "13.7199",
  longitude: "80.2304",
  altitude: "0.01",
  minimumElevation: "10",
  network: "Custom",
};

export function GroundOperationsModalContent({
  workspaceId,
  targetSnapshot,
  stations,
  simulationTimeIso,
  horizon,
  onHorizonChange,
  groundStationDisplay,
  onGroundStationDisplayChange,
  onCreateStation,
  onUpdateStation,
  onDeleteStation,
  onCloneStation,
  onImportStation,
  onImportNetwork,
}: {
  workspaceId: string;
  targetSnapshot: SatelliteSnapshot | null;
  stations: GroundStation[];
  simulationTimeIso: string;
  horizon: GroundOpsHorizon;
  onHorizonChange: (horizon: GroundOpsHorizon) => void;
  groundStationDisplay: GroundStationDisplayOptions;
  onGroundStationDisplayChange: (display: GroundStationDisplayOptions) => void;
  onCreateStation: (station: Omit<GroundStation, "id">) => void;
  onUpdateStation: (station: GroundStation) => void;
  onDeleteStation: (station: GroundStation) => void;
  onCloneStation: (station: GroundStation) => void;
  onImportStation: (catalogId: string) => void;
  onImportNetwork: (network: GroundStationNetwork) => void;
}) {
  const [selectedStationId, setSelectedStationId] = useState(stations[0]?.id ?? "");
  const [draft, setDraft] = useState<GroundStationDraft>(defaultDraft);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const service = useMemo(() => new GroundOperationsService(), []);
  const selectedStation = stations.find((station) => station.id === selectedStationId) ?? stations[0] ?? null;
  const analysis: GroundOperationsAnalysis | null = useMemo(() => (
    targetSnapshot ? service.analyze(targetSnapshot, stations, simulationTimeIso) : null
  ), [service, simulationTimeIso, stations, targetSnapshot]);
  const horizonOption = groundOpsHorizonOptions.find((option) => option.id === horizon.id) ?? groundOpsHorizonOptions[2];
  const horizonLabel = horizon.id === "CUSTOM"
    ? `${horizon.customHours || "Custom"} Hours`
    : horizonOption.label;
  const upcomingWindows = useMemo(() => (
    analysis?.accessWindows
      .filter((window) => new Date(window.losUtc).getTime() >= new Date(simulationTimeIso).getTime())
      .slice(0, 10) ?? []
  ), [analysis, simulationTimeIso]);
  const stationRankings = useMemo(() => buildStationRankings(analysis), [analysis]);
  const contactSummary = useMemo(
    () => buildContactSummary(analysis, upcomingWindows, stationRankings),
    [analysis, stationRankings, upcomingWindows],
  );

  function updateDraft(patch: Partial<GroundStationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function createStation() {
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    const altitude = Number(draft.altitude);
    const minimumElevation = Number(draft.minimumElevation);
    if (!draft.name.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(altitude) || !Number.isFinite(minimumElevation)) {
      return;
    }
    onCreateStation({
      workspaceId,
      name: draft.name.trim(),
      latitude,
      longitude,
      altitude,
      minimumElevation,
      source: "USER",
      network: draft.network,
      enabled: true,
    });
    setDraft(defaultDraft);
    setIsCreateOpen(false);
  }

  function patchSelectedStation(patch: Partial<GroundStation>) {
    if (!selectedStation) {
      return;
    }
    onUpdateStation({ ...selectedStation, ...patch });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 border border-cyan-300/20 bg-[#071016]/95 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">Ground Operations</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{targetSnapshot?.satellite.name ?? "No Orbit Loaded"}</h3>
            <p className="mt-1 text-sm text-zinc-400">Analysis Horizon: <span className="text-cyan-100">{horizonLabel}</span></p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[220px_auto]">
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">Analysis Horizon</span>
              <select
                className="timeline-input py-2 text-xs"
                value={horizon.id}
                onChange={(event) => onHorizonChange({ ...horizon, id: event.target.value as GroundOpsHorizonId })}
              >
                {groundOpsHorizonOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            {horizon.id === "CUSTOM" && (
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">Hours</span>
                <input className="timeline-input py-2 text-xs" value={horizon.customHours} onChange={(event) => onHorizonChange({ ...horizon, customHours: event.target.value })} inputMode="decimal" />
              </label>
            )}
            <div className={`flex items-end gap-2 ${horizon.id === "CUSTOM" ? "sm:col-span-2" : ""}`}>
              <GroundOpsCommandToggle
                label="Stations"
                active={groundStationDisplay.stations}
                onToggle={() => onGroundStationDisplayChange({ ...groundStationDisplay, stations: !groundStationDisplay.stations })}
              />
              <GroundOpsCommandToggle
                label="Footprints"
                active={groundStationDisplay.footprints}
                onToggle={() => onGroundStationDisplayChange({ ...groundStationDisplay, footprints: !groundStationDisplay.footprints })}
              />
              <GroundOpsCommandToggle
                label="Contact Lines"
                active={groundStationDisplay.contactLines}
                onToggle={() => onGroundStationDisplayChange({ ...groundStationDisplay, contactLines: !groundStationDisplay.contactLines })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:col-span-2">
              <GroundOpsMetric label="Stations" value={String(stations.length)} />
              <GroundOpsMetric label="Enabled" value={String(stations.filter((station) => station.enabled).length)} />
              <GroundOpsMetric label="Samples" value={String(analysis?.sampleCount ?? 0)} />
            </div>
          </div>
        </div>
      </div>

      <div className="thin-scrollbar always-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {!targetSnapshot && (
          <GroundOpsPanel title="Orbit Required">
            <p className="text-sm text-zinc-300">Create or import an orbit to begin ground-station analysis.</p>
          </GroundOpsPanel>
        )}

        {targetSnapshot && (
          <>
            <MissionContactSummary summary={contactSummary} />
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <StationRankingPanel rankings={stationRankings} />
              <CoverageSummaryCard summary={contactSummary} />
            </div>
          </>
        )}

        <GroundOpsPanel title="Ground Stations">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="min-w-0">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  aria-label="Import catalog network"
                  onChange={(event) => {
                    if (event.target.value) {
                      onImportNetwork(event.target.value as GroundStationNetwork);
                    }
                  }}
                  className="timeline-input"
                  value=""
                >
                  <option value="">Import Catalog...</option>
                  {groundStationNetworks.map((network) => (
                    <option key={network} value={network}>{network}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setIsCreateOpen(true)} className="border border-cyan-300/55 px-4 py-2 font-mono text-xs uppercase text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950">
                  + New Station
                </button>
              </div>
              <div className="mt-3">
                <select
                  aria-label="Catalog station"
                  onChange={(event) => event.target.value && onImportStation(event.target.value)}
                  className="timeline-input"
                  value=""
                >
                  <option value="">Import station...</option>
                  {groundStationCatalog.map((station) => (
                    <option key={station.catalogId} value={station.catalogId}>{station.network} / {station.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-4 grid gap-2">
                {stations.length === 0 ? (
                  <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">No workspace stations yet. Import a network or create a custom station.</p>
                ) : stations.map((station) => (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => setSelectedStationId(station.id)}
                    className={`border p-3 text-left transition ${selectedStation?.id === station.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/25 hover:border-cyan-300/45"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block text-sm font-semibold text-white">{station.name}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{station.network} / {station.source}</span>
                      </span>
                      <span className={`border px-2 py-1 font-mono text-[9px] uppercase ${station.enabled ? "border-emerald-300/40 text-emerald-200" : "border-white/10 text-zinc-500"}`}>
                        {station.enabled ? "Enabled" : "Off"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              {selectedStation && (
                <div className="grid gap-3 border border-cyan-300/20 bg-cyan-300/[0.04] p-4 sm:grid-cols-2">
                  <GroundOpsField label="Selected station"><input className="timeline-input" value={selectedStation.name} onChange={(event) => patchSelectedStation({ name: event.target.value })} /></GroundOpsField>
                  <GroundOpsField label="Min elevation deg"><input className="timeline-input" value={String(selectedStation.minimumElevation)} onChange={(event) => patchSelectedStation({ minimumElevation: Number(event.target.value) })} /></GroundOpsField>
                  <GroundOpsField label="Latitude deg"><input className="timeline-input" value={String(selectedStation.latitude)} onChange={(event) => patchSelectedStation({ latitude: Number(event.target.value) })} /></GroundOpsField>
                  <GroundOpsField label="Longitude deg"><input className="timeline-input" value={String(selectedStation.longitude)} onChange={(event) => patchSelectedStation({ longitude: Number(event.target.value) })} /></GroundOpsField>
                  <GroundOpsField label="Altitude km"><input className="timeline-input" value={String(selectedStation.altitude)} onChange={(event) => patchSelectedStation({ altitude: Number(event.target.value) })} /></GroundOpsField>
                  <GroundOpsField label="Network">
                    <select className="timeline-input" value={selectedStation.network} onChange={(event) => patchSelectedStation({ network: event.target.value as GroundStationNetwork })}>
                      {["Custom", ...groundStationNetworks].map((network) => <option key={network} value={network}>{network}</option>)}
                    </select>
                  </GroundOpsField>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button type="button" onClick={() => patchSelectedStation({ enabled: !selectedStation.enabled })} className="workspace-action">{selectedStation.enabled ? "Disable" : "Enable"}</button>
                    <button type="button" onClick={() => onCloneStation(selectedStation)} className="workspace-action">Clone</button>
                    <button type="button" onClick={() => onDeleteStation(selectedStation)} className="workspace-action danger">Delete</button>
                  </div>
                </div>
              )}
              {!selectedStation && (
                <div className="border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
                  Select a station or create a new one.
                </div>
              )}
            </div>
          </div>
        </GroundOpsPanel>

        <GroundOpsPanel title="Access Windows">
          <AccessWindowTable windows={upcomingWindows} stationSummaries={analysis?.stationSummaries ?? []} horizonLabel={horizonLabel} />
        </GroundOpsPanel>

        <GroundOpsPanel title="Pass Prediction">
          <PassPredictionPanel stationSummaries={analysis?.stationSummaries ?? []} horizonLabel={horizonLabel} />
        </GroundOpsPanel>

        <GroundOpsPanel title="Mission Contact Timeline">
          <ContactTimeline windows={upcomingWindows} stationSummaries={analysis?.stationSummaries ?? []} horizonLabel={horizonLabel} />
        </GroundOpsPanel>
      </div>

      <div className="shrink-0 border border-cyan-300/20 bg-[#071016]/95 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <span>{stations.filter((station) => station.enabled).length} enabled stations</span>
          <span>Generated {analysis ? compactIsoUtc(analysis.generatedAt) : "--"}</span>
        </div>
      </div>

      {isCreateOpen && (
        <NewStationDialog
          draft={draft}
          onDraftChange={updateDraft}
          onCreate={createStation}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </div>
  );
}

function NewStationDialog({
  draft,
  onDraftChange,
  onCreate,
  onClose,
}: {
  draft: GroundStationDraft;
  onDraftChange: (patch: Partial<GroundStationDraft>) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create ground station">
      <div className="w-[min(720px,100%)] border border-cyan-300/30 bg-[#071016] shadow-2xl">
        <div className="flex items-center justify-between border-b border-cyan-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">Ground Station</p>
            <h4 className="mt-1 text-lg font-semibold text-white">New Station</h4>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-cyan-300 hover:text-white" aria-label="Close new station dialog" title="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <GroundOpsField label="Name"><input className="timeline-input" value={draft.name} onChange={(event) => onDraftChange({ name: event.target.value })} /></GroundOpsField>
          <GroundOpsField label="Network">
            <select className="timeline-input" value={draft.network} onChange={(event) => onDraftChange({ network: event.target.value as GroundStationNetwork })}>
              {["Custom", ...groundStationNetworks].map((network) => <option key={network} value={network}>{network}</option>)}
            </select>
          </GroundOpsField>
          <GroundOpsField label="Latitude deg"><input className="timeline-input" value={draft.latitude} onChange={(event) => onDraftChange({ latitude: event.target.value })} /></GroundOpsField>
          <GroundOpsField label="Longitude deg"><input className="timeline-input" value={draft.longitude} onChange={(event) => onDraftChange({ longitude: event.target.value })} /></GroundOpsField>
          <GroundOpsField label="Altitude km"><input className="timeline-input" value={draft.altitude} onChange={(event) => onDraftChange({ altitude: event.target.value })} /></GroundOpsField>
          <GroundOpsField label="Min elevation deg"><input className="timeline-input" value={draft.minimumElevation} onChange={(event) => onDraftChange({ minimumElevation: event.target.value })} /></GroundOpsField>
        </div>
        <div className="flex justify-end gap-2 border-t border-cyan-300/20 px-5 py-4">
          <button type="button" onClick={onClose} className="border border-white/15 px-4 py-2 font-mono text-xs uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">Cancel</button>
          <button type="button" onClick={onCreate} className="border border-cyan-300 bg-cyan-300 px-4 py-2 font-mono text-xs uppercase text-slate-950 transition hover:bg-cyan-200">Create Station</button>
        </div>
      </div>
    </div>
  );
}

function GroundOpsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-cyan-300/18 bg-[#071016]/72 p-4">
      <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{title}</h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function GroundOpsField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function GroundOpsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cyan-300/20 bg-black/25 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-semibold text-cyan-100" title={value}>{value}</p>
    </div>
  );
}

function GroundOpsCommandToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-[38px] whitespace-nowrap border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
        active
          ? "border-cyan-300 bg-cyan-300/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
          : "border-white/10 bg-black/25 text-zinc-500 hover:border-cyan-300/45 hover:text-cyan-100"
      }`}
      aria-pressed={active}
    >
      {label} <span className={active ? "text-emerald-200" : "text-zinc-600"}>{active ? "ON" : "OFF"}</span>
    </button>
  );
}

type StationRanking = {
  stationId: string;
  stationName: string;
  passes: number;
  totalDurationSeconds: number;
  maxElevationDeg: number | null;
};

type ContactSummary = {
  bestStation: string;
  totalPasses: number;
  totalContactSeconds: number;
  longestPassSeconds: number;
  nextContactUtc: string | null;
  averageMaxElevationDeg: number | null;
  averagePassDurationSeconds: number;
  coverageQuality: "EXCELLENT" | "GOOD" | "LIMITED" | "NO ACCESS";
};

function buildStationRankings(analysis: GroundOperationsAnalysis | null): StationRanking[] {
  if (!analysis) {
    return [];
  }
  return analysis.stationSummaries
    .map((summary) => {
      const totalDurationSeconds = summary.windows.reduce((total, window) => total + window.durationSeconds, 0);
      const maxElevationDeg = summary.windows.length > 0
        ? Math.max(...summary.windows.map((window) => window.maxElevationDeg))
        : summary.maxElevationDeg;
      return {
        stationId: summary.station.id,
        stationName: summary.station.name,
        passes: summary.windows.length,
        totalDurationSeconds,
        maxElevationDeg,
      };
    })
    .toSorted((a, b) => (
      b.passes - a.passes ||
      b.totalDurationSeconds - a.totalDurationSeconds ||
      (b.maxElevationDeg ?? Number.NEGATIVE_INFINITY) - (a.maxElevationDeg ?? Number.NEGATIVE_INFINITY)
    ));
}

function buildContactSummary(
  analysis: GroundOperationsAnalysis | null,
  upcomingWindows: GroundOperationsAnalysis["accessWindows"],
  rankings: StationRanking[],
): ContactSummary {
  const allWindows = analysis?.accessWindows ?? [];
  const totalPasses = allWindows.length;
  const totalContactSeconds = allWindows.reduce((total, window) => total + window.durationSeconds, 0);
  const longestPassSeconds = allWindows.reduce((longest, window) => Math.max(longest, window.durationSeconds), 0);
  const maxElevationValues = allWindows.map((window) => window.maxElevationDeg);
  const averageMaxElevationDeg = maxElevationValues.length > 0
    ? maxElevationValues.reduce((total, value) => total + value, 0) / maxElevationValues.length
    : null;
  const averagePassDurationSeconds = totalPasses > 0 ? totalContactSeconds / totalPasses : 0;
  const coverageQuality = totalPasses >= 12 && totalContactSeconds >= 60 * 60
    ? "EXCELLENT"
    : totalPasses >= 4 && totalContactSeconds >= 20 * 60
      ? "GOOD"
      : totalPasses > 0
        ? "LIMITED"
        : "NO ACCESS";

  return {
    bestStation: rankings[0]?.passes ? rankings[0].stationName : "--",
    totalPasses,
    totalContactSeconds,
    longestPassSeconds,
    nextContactUtc: upcomingWindows[0]?.aosUtc ?? null,
    averageMaxElevationDeg,
    averagePassDurationSeconds,
    coverageQuality,
  };
}

function minuteLabel(seconds: number) {
  if (seconds <= 0) {
    return "--";
  }
  return `${Math.round(seconds / 60)} min`;
}

function MissionContactSummary({ summary }: { summary: ContactSummary }) {
  return (
    <section className="border border-cyan-300/25 bg-[#071016]/82 p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <GroundOpsMetric label="Best Station" value={summary.bestStation} />
        <GroundOpsMetric label="Total Passes" value={String(summary.totalPasses)} />
        <GroundOpsMetric label="Contact Time" value={minuteLabel(summary.totalContactSeconds)} />
        <GroundOpsMetric label="Longest Pass" value={minuteLabel(summary.longestPassSeconds)} />
        <GroundOpsMetric label="Next Contact" value={summary.nextContactUtc ? compactIsoUtc(summary.nextContactUtc) : "--"} />
        <GroundOpsMetric label="Avg Max Elev" value={summary.averageMaxElevationDeg === null ? "--" : `${formatNumber(summary.averageMaxElevationDeg, 1)} deg`} />
      </div>
    </section>
  );
}

function StationRankingPanel({ rankings }: { rankings: StationRanking[] }) {
  return (
    <GroundOpsPanel title="Station Ranking">
      {rankings.length === 0 ? (
        <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">Enable stations to rank contact performance.</p>
      ) : (
        <div className="space-y-2">
          {rankings.map((ranking, index) => (
            <div
              key={ranking.stationId}
              className={`flex items-center justify-between gap-4 border p-3 ${
                index === 0 && ranking.passes > 0
                  ? "border-emerald-300/45 bg-emerald-300/[0.07]"
                  : "border-white/10 bg-black/25"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white" title={ranking.stationName}>#{index + 1} {ranking.stationName}</p>
                <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">
                  {ranking.passes} passes / {minuteLabel(ranking.totalDurationSeconds)}
                </p>
              </div>
              <div className="text-right font-mono text-xs text-cyan-100">
                {ranking.maxElevationDeg === null ? "--" : `${formatNumber(ranking.maxElevationDeg, 1)} deg`}
              </div>
            </div>
          ))}
        </div>
      )}
    </GroundOpsPanel>
  );
}

function CoverageSummaryCard({ summary }: { summary: ContactSummary }) {
  return (
    <GroundOpsPanel title="Coverage Summary">
      <div className="grid gap-3 sm:grid-cols-2">
        <GroundOpsMetric label="Coverage Quality" value={summary.coverageQuality} />
        <GroundOpsMetric label="Best Station" value={summary.bestStation} />
        <GroundOpsMetric label="Total Passes" value={String(summary.totalPasses)} />
        <GroundOpsMetric label="Contact Time" value={minuteLabel(summary.totalContactSeconds)} />
        <GroundOpsMetric label="Average Pass" value={minuteLabel(summary.averagePassDurationSeconds)} />
        <GroundOpsMetric label="Longest Pass" value={minuteLabel(summary.longestPassSeconds)} />
      </div>
    </GroundOpsPanel>
  );
}

function stationStatusLabel(summary: GroundOperationsAnalysis["stationSummaries"][number]) {
  if (summary.current?.visible) {
    return "Visible Now";
  }
  if (summary.nextWindow) {
    return "Upcoming Pass";
  }
  return "No Access";
}

function stationStatusClass(summary: GroundOperationsAnalysis["stationSummaries"][number]) {
  if (summary.current?.visible) {
    return "border-emerald-300/45 bg-emerald-300/[0.07] text-emerald-200";
  }
  if (summary.nextWindow) {
    return "border-cyan-300/45 bg-cyan-300/[0.07] text-cyan-100";
  }
  return "border-white/10 text-zinc-500";
}

function NoAccessReason({ summary, horizonLabel }: { summary: GroundOperationsAnalysis["stationSummaries"][number]; horizonLabel: string }) {
  const currentElevation = summary.current?.elevationDeg;
  const maxElevation = summary.maxElevationDeg;
  return (
    <div className="border border-amber-300/25 bg-amber-300/[0.045] p-4 text-sm text-zinc-300">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100">No Contacts Found</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <GroundOpsMetric label="Current Elevation" value={`${formatNumber(currentElevation, 1)} deg`} />
        <GroundOpsMetric label="Maximum Elevation" value={`${formatNumber(maxElevation ?? undefined, 1)} deg`} />
      </div>
      <p className="mt-3 text-xs text-zinc-400">No pass crosses the station minimum elevation in the selected {horizonLabel.toLowerCase()} horizon.</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-50/85">
        <li>Increase analysis horizon</li>
        <li>Add stations closer to the orbit ground track</li>
        <li>Reduce minimum elevation threshold</li>
      </ul>
    </div>
  );
}

function AccessWindowTable({
  windows,
  stationSummaries = [],
  horizonLabel = "",
  compact = false,
}: {
  windows: GroundOperationsAnalysis["accessWindows"];
  stationSummaries?: GroundOperationsAnalysis["stationSummaries"];
  horizonLabel?: string;
  compact?: boolean;
}) {
  if (windows.length === 0) {
    return (
      <div className="grid gap-3">
        {stationSummaries.length === 0 ? (
          <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">Enable at least one station to generate access windows.</p>
        ) : stationSummaries.map((summary) => (
          <NoAccessReason key={summary.station.id} summary={summary} horizonLabel={horizonLabel} />
        ))}
      </div>
    );
  }
  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className={`w-full border-collapse text-left text-xs ${compact ? "min-w-[520px]" : "min-w-[620px]"}`}>
        <thead className="border-b border-cyan-300/20 font-mono uppercase tracking-[0.12em] text-zinc-500">
          <tr>
            <th className="py-2 pr-3">Station</th>
            <th className="py-2 pr-3">AOS</th>
            <th className="py-2 pr-3">LOS</th>
            <th className="py-2 pr-3">Duration</th>
            <th className="py-2 pr-3">Max Elevation</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((window) => (
            <tr key={window.id} className="border-b border-white/5 text-zinc-300 last:border-b-0">
              <td className="py-2 pr-3">{window.stationName}</td>
              <td className="py-2 pr-3 font-mono">{compactIsoUtc(window.aosUtc)}</td>
              <td className="py-2 pr-3 font-mono">{compactIsoUtc(window.losUtc)}</td>
              <td className="py-2 pr-3">{secondsToDurationLabel(window.durationSeconds)}</td>
              <td className="py-2 pr-3">{formatNumber(window.maxElevationDeg, 1)} deg</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PassPredictionPanel({
  stationSummaries,
  horizonLabel,
}: {
  stationSummaries: GroundOperationsAnalysis["stationSummaries"];
  horizonLabel: string;
}) {
  if (stationSummaries.length === 0) {
    return <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">Enable at least one station to predict passes.</p>;
  }

  return (
    <div className="grid gap-3">
      {stationSummaries.map((summary) => (
        <div key={summary.station.id} className="border border-white/10 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{summary.station.name}</p>
              <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">Next Pass</p>
            </div>
            <span className={`border px-2 py-1 font-mono text-[9px] uppercase ${stationStatusClass(summary)}`}>{stationStatusLabel(summary)}</span>
          </div>
          {summary.nextWindow ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <GroundOpsMetric label="Next AOS" value={compactIsoUtc(summary.nextWindow.aosUtc)} />
              <GroundOpsMetric label="Duration" value={secondsToDurationLabel(summary.nextWindow.durationSeconds)} />
              <GroundOpsMetric label="Peak Elevation" value={`${formatNumber(summary.nextWindow.maxElevationDeg, 1)} deg`} />
              <GroundOpsMetric label="Status" value={summary.current?.visible ? "VISIBLE" : "UPCOMING"} />
              {summary.windows.length > 1 && (
                <details className="sm:col-span-4">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100">Show all {summary.windows.length} passes</summary>
                  <div className="mt-3">
                    <AccessWindowTable windows={summary.windows} compact />
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">No pass in selected horizon</p>
              <NoAccessReason summary={summary} horizonLabel={horizonLabel} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ContactTimeline({
  windows,
  stationSummaries,
  horizonLabel,
}: {
  windows: GroundOperationsAnalysis["accessWindows"];
  stationSummaries: GroundOperationsAnalysis["stationSummaries"];
  horizonLabel: string;
}) {
  if (windows.length === 0) {
    return (
      <div className="grid gap-3">
        {stationSummaries.length === 0 ? (
          <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">Enable at least one station to generate a contact timeline.</p>
        ) : stationSummaries.map((summary) => (
          <NoAccessReason key={summary.station.id} summary={summary} horizonLabel={horizonLabel} />
        ))}
      </div>
    );
  }

  const events = windows.flatMap((window) => [
    { id: `${window.id}-aos`, timeUtc: window.aosUtc, stationName: window.stationName, event: "AOS" },
    { id: `${window.id}-los`, timeUtc: window.losUtc, stationName: window.stationName, event: "LOS" },
  ]).toSorted((a, b) => new Date(a.timeUtc).getTime() - new Date(b.timeUtc).getTime());

  return (
    <div className="border border-white/10 bg-black/25">
      {events.map((event) => (
        <div key={event.id} className="grid grid-cols-[74px_58px_1fr] gap-3 border-b border-white/5 px-3 py-2 text-sm last:border-b-0">
          <span className="font-mono text-cyan-100">{compactIsoUtc(event.timeUtc)}</span>
          <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${event.event === "AOS" ? "text-emerald-200" : "text-amber-100"}`}>{event.event}</span>
          <span className="truncate text-zinc-300" title={event.stationName}>{event.stationName}</span>
        </div>
      ))}
    </div>
  );
}
