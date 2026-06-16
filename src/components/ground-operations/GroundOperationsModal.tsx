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
  const upcomingWindows = analysis?.accessWindows
    .filter((window) => new Date(window.losUtc).getTime() >= new Date(simulationTimeIso).getTime())
    .slice(0, 10) ?? [];

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
            <p className="mt-1 text-sm text-zinc-400">Analyze satellite visibility, contact opportunities, and ground-station access windows.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <GroundOpsMetric label="Stations" value={String(stations.length)} />
            <GroundOpsMetric label="Enabled" value={String(stations.filter((station) => station.enabled).length)} />
            <GroundOpsMetric label="Samples" value={String(analysis?.sampleCount ?? 0)} />
          </div>
        </div>
      </div>

      <div className="thin-scrollbar always-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {!targetSnapshot && (
          <GroundOpsPanel title="Orbit Required">
            <p className="text-sm text-zinc-300">Create or import an orbit to begin ground-station analysis.</p>
          </GroundOpsPanel>
        )}

        <GroundOpsPanel title="1. Ground Stations">
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

        <GroundOpsPanel title="2. Visibility Analysis">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analysis?.stationSummaries.map((summary) => (
              <div key={summary.station.id} className="border border-white/10 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{summary.station.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{summary.station.network}</p>
                  </div>
                  <span className={`border px-2 py-1 font-mono text-[9px] uppercase ${summary.current?.visible ? "border-emerald-300/45 text-emerald-200" : "border-white/10 text-zinc-500"}`}>
                    {summary.current?.visible ? "Visible" : "Not Visible"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <GroundOpsMetric label="Elevation" value={`${formatNumber(summary.current?.elevationDeg, 1)} deg`} />
                  <GroundOpsMetric label="Max El" value={`${formatNumber(summary.maxElevationDeg ?? undefined, 1)} deg`} />
                  <GroundOpsMetric label="Access" value={`${formatNumber(summary.visibilityPercentage, 1)}%`} />
                  <GroundOpsMetric label="Next Pass" value={summary.nextWindow ? compactIsoUtc(summary.nextWindow.aosUtc) : "--"} />
                </div>
              </div>
            ))}
            {analysis?.stationSummaries.length === 0 && <p className="text-sm text-zinc-400">Enable at least one ground station to run visibility analysis.</p>}
          </div>
        </GroundOpsPanel>

        <GroundOpsPanel title="3. Access Windows">
          <AccessWindowTable windows={analysis?.accessWindows ?? []} />
        </GroundOpsPanel>

        <GroundOpsPanel title="4. Pass Prediction">
          <AccessWindowTable windows={upcomingWindows} compact />
        </GroundOpsPanel>

        <GroundOpsPanel title="5. Contact Timeline">
          <ContactTimeline windows={upcomingWindows} />
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

function AccessWindowTable({ windows, compact = false }: { windows: GroundOperationsAnalysis["accessWindows"]; compact?: boolean }) {
  if (windows.length === 0) {
    return <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">No access windows in the current trajectory window.</p>;
  }
  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead className="border-b border-cyan-300/20 font-mono uppercase tracking-[0.12em] text-zinc-500">
          <tr>
            <th className="py-2 pr-3">Pass</th>
            <th className="py-2 pr-3">Station</th>
            <th className="py-2 pr-3">AOS</th>
            <th className="py-2 pr-3">LOS</th>
            <th className="py-2 pr-3">Duration</th>
            <th className="py-2 pr-3">Max Elevation</th>
            {!compact && <th className="py-2 pr-3">Orbit</th>}
          </tr>
        </thead>
        <tbody>
          {windows.map((window) => (
            <tr key={window.id} className="border-b border-white/5 text-zinc-300 last:border-b-0">
              <td className="py-2 pr-3 font-mono text-cyan-100">{window.passNumber}</td>
              <td className="py-2 pr-3">{window.stationName}</td>
              <td className="py-2 pr-3 font-mono">{compactIsoUtc(window.aosUtc)}</td>
              <td className="py-2 pr-3 font-mono">{compactIsoUtc(window.losUtc)}</td>
              <td className="py-2 pr-3">{secondsToDurationLabel(window.durationSeconds)}</td>
              <td className="py-2 pr-3">{formatNumber(window.maxElevationDeg, 1)} deg</td>
              {!compact && <td className="py-2 pr-3">{window.orbitNumber ?? "--"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactTimeline({ windows }: { windows: GroundOperationsAnalysis["accessWindows"] }) {
  if (windows.length === 0) {
    return <p className="border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">No upcoming contacts to render.</p>;
  }
  const startMs = Math.min(...windows.map((window) => new Date(window.aosUtc).getTime()));
  const endMs = Math.max(...windows.map((window) => new Date(window.losUtc).getTime()));
  const spanMs = Math.max(1, endMs - startMs);
  const byStation = windows.reduce<Map<string, typeof windows>>((groups, window) => {
    const stationWindows = groups.get(window.stationName) ?? [];
    groups.set(window.stationName, [...stationWindows, window]);
    return groups;
  }, new Map());

  return (
    <div className="space-y-3">
      {[...byStation.entries()].map(([stationName, stationWindows]) => (
        <div key={stationName} className="grid gap-2 md:grid-cols-[180px_1fr]">
          <p className="truncate text-sm text-zinc-300" title={stationName}>{stationName}</p>
          <div className="relative h-9 border border-white/10 bg-black/30">
            {stationWindows.map((window) => {
              const left = ((new Date(window.aosUtc).getTime() - startMs) / spanMs) * 100;
              const width = Math.max(1.5, ((new Date(window.losUtc).getTime() - new Date(window.aosUtc).getTime()) / spanMs) * 100);
              return (
                <div
                  key={window.id}
                  className="absolute top-2 h-5 border border-emerald-200/60 bg-emerald-300/30"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${compactIsoUtc(window.aosUtc)} -> ${compactIsoUtc(window.losUtc)}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
