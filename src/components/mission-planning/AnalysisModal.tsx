import { useMemo, useState } from "react";
import type { SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import type { ConjunctionSnapshot } from "@/domain/conjunction";
import { getConjunctionTone } from "@/domain/conjunction";
import { formatNumber, formatUtc } from "@/geometry/format";
import type { AnalysisPresetId, BackendAnalysisConfigResponse, BackendCapabilityRegistry, BackendMissionTimelineEvent, BackendPropagationProfile, UpdatePropagationProfileRequest } from "@/services/orbitServerApi";
import type { MissionTrajectoryOverlay } from "./types";
import { PropagationProfileEditor } from "./PropagationProfileEditor";
import { OrbitSummaryPanel } from "./OrbitSummaryPanel";
import type { OrbitSummary } from "./OrbitSummaryPanel";
import { DetailMetric, HudPanel } from "./ui";
import { compactIsoUtc, deltaVBreakdown, detectOrbitEventMarkers, estimatedEventDeltaVMps, maneuverQualityAnalysis, readNumberParameter, readStringParameter, secondsToDurationLabel } from "./utils";

const analysisPresetOptions = [
  { id: "FAST_PREVIEW", label: "Fast" },
  { id: "OPERATIONAL_REVIEW", label: "Ops" },
  { id: "HIGH_FIDELITY", label: "High" },
  { id: "MANEUVER_PLANNING", label: "Burn" },
] satisfies Array<{ id: AnalysisPresetId; label: string }>;
const analysisModeOptions = [
  { id: "gravity", label: "Grav", key: "gravityEnabled" },
  { id: "drag", label: "Drag", key: "dragEnabled" },
  { id: "srp", label: "SRP", key: "solarRadiationPressureEnabled" },
  { id: "sun", label: "Sun", key: "thirdBodySunEnabled" },
  { id: "moon", label: "Moon", key: "thirdBodyMoonEnabled" },
  { id: "maneuver", label: "Burn", key: "maneuverModelEnabled" },
] satisfies Array<{ id: string; label: string; key: keyof BackendAnalysisConfigResponse["config"] }>;

function getConjunctionStatusDescription(status: ConjunctionSnapshot["status"]) {
  if (status === "critical") {
    return "Critical means the closest approach is inside the configured critical miss-distance threshold.";
  }

  if (status === "warning") {
    return "Warning means the satellites pass inside the warning threshold, but not inside the critical threshold.";
  }

  return "Safe means the closest approach stays outside the configured warning threshold.";
}

export function AnalysisModalContent({
  selectedNoradId,
  canUseAnalysisConfig,
  analysisConfig,
  missionPropagationProfile,
  capabilities,
  propagationProfileStatus,
  analysisMessage,
  rangePrimaryId,
  rangeSecondaryId,
  satellites,
  canUseRangeCheck,
  effectiveShowRangeCheck,
  rangeMeasurement,
  missionEvents,
  orbitSummary,
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  canShowConjunctions,
  trajectoryOverlay,
  onApplyPreset,
  onToggleMode,
  pendingPropagationProfileUpdate,
  onStagePropagationProfile,
  onCommitPropagationProfileDraft,
  onToggleRangeCheck,
  onUpdateRangePrimary,
  onUpdateRangeSecondary,
  onSelectConjunction,
  onToggleConjunctions,
}: {
  selectedNoradId: string | number | null;
  canUseAnalysisConfig: boolean;
  analysisConfig: BackendAnalysisConfigResponse | null;
  missionPropagationProfile: BackendPropagationProfile | null;
  capabilities: BackendCapabilityRegistry;
  propagationProfileStatus: string | null;
  analysisMessage: string | null;
  rangePrimaryId: string;
  rangeSecondaryId: string;
  satellites: SatelliteObject[];
  canUseRangeCheck: boolean;
  effectiveShowRangeCheck: boolean;
  rangeMeasurement: { primary: SatelliteSnapshot; secondary: SatelliteSnapshot; distanceKm: number } | null;
  missionEvents: BackendMissionTimelineEvent[];
  orbitSummary: OrbitSummary;
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  canShowConjunctions: boolean;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  onApplyPreset: (preset: AnalysisPresetId) => void;
  onToggleMode: (mode: string, enabled: boolean) => void;
  pendingPropagationProfileUpdate: UpdatePropagationProfileRequest | null;
  onStagePropagationProfile: (request: UpdatePropagationProfileRequest) => void;
  onCommitPropagationProfileDraft: () => void;
  onToggleRangeCheck: () => void;
  onUpdateRangePrimary: (satelliteId: string) => void;
  onUpdateRangeSecondary: (satelliteId: string) => void;
  onSelectConjunction: (eventId: string) => void;
  onToggleConjunctions: () => void;
}) {
  const [tab, setTab] = useState<"trajectory" | "range" | "maneuver" | "propagation" | "conjunction">("trajectory");
  const missionBurnEvents = useMemo(
    () => missionEvents.filter((event) => event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN"),
    [missionEvents],
  );
  const finiteBurnCount = missionBurnEvents.filter((event) => event.type === "FINITE_BURN").length;
  const impulsiveBurnCount = missionBurnEvents.filter((event) => event.type === "IMPULSIVE_BURN").length;
  const totalBurnDuration = missionBurnEvents.reduce((sum, event) => sum + readNumberParameter(event.parameters ?? {}, "durationSeconds", 0), 0);
  const totalDeltaVMps = missionBurnEvents.reduce((sum, event) => sum + estimatedEventDeltaVMps(event), 0);
  const orbitEventMarkers = useMemo(() => detectOrbitEventMarkers(trajectoryOverlay?.mission?.trajectory), [trajectoryOverlay]);
  const dvBreakdown = useMemo(() => deltaVBreakdown(missionEvents), [missionEvents]);
  const visiblePropagationConfig = missionPropagationProfile ?? analysisConfig?.config ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-5 border border-cyan-300/20 max-sm:grid-cols-2">
        {[
          { id: "trajectory" as const, label: "Trajectory" },
          { id: "range" as const, label: "Range" },
          { id: "maneuver" as const, label: "Maneuver" },
          { id: "propagation" as const, label: "Propagation" },
          { id: "conjunction" as const, label: "Conjunction" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 font-mono text-xs uppercase transition ${tab === item.id ? "bg-cyan-300 text-slate-950" : "text-cyan-100 hover:bg-cyan-300/10"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-scroll pr-1">
        {tab === "trajectory" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <HudPanel>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Trajectory Preview</p>
              <p className="mt-2 text-sm text-zinc-300">{trajectoryOverlay ? trajectoryOverlay.message : "No mission trajectory generated yet."}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DetailMetric label="Mission Overlay" value={trajectoryOverlay?.mission ? "Ready" : "--"} />
                <DetailMetric label="Generated" value={trajectoryOverlay ? compactIsoUtc(trajectoryOverlay.generatedAt) : "--"} />
                <DetailMetric label="Cadence" value={trajectoryOverlay ? `${trajectoryOverlay.sampleCadenceSeconds}s` : "--"} />
                <DetailMetric label="Orbit Events" value={String(orbitEventMarkers.length)} />
              </div>
              <div className="mt-3 grid gap-2">
                {orbitEventMarkers.length === 0 ? (
                  <p className="border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-500">Generate trajectory samples to detect apsides, node crossings, and eclipse transitions.</p>
                ) : orbitEventMarkers.slice(0, 6).map((marker) => (
                  <div key={marker.id} className="border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase text-cyan-100">{marker.type.replaceAll("_", " ")}</p>
                      <p className="font-mono text-[10px] text-zinc-500">{compactIsoUtc(marker.timeUtc)}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">Alt {formatNumber(marker.altitudeKm, 2)} km · radius {formatNumber(marker.radiusKm, 2)} km</p>
                  </div>
                ))}
              </div>
            </HudPanel>

            <HudPanel>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Analysis Config</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    {missionPropagationProfile ? "Mission profile used by trajectory" : selectedNoradId ? `NORAD ${selectedNoradId}` : "Manual/local orbit"}
                  </p>
                </div>
                <span className="border border-cyan-300/30 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                  {visiblePropagationConfig?.propagatorType.replaceAll("_", " ") ?? "--"}
                </span>
              </div>
              {missionPropagationProfile ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DetailMetric label="Profile" value={missionPropagationProfile.name} />
                  <DetailMetric label="Maneuvers" value={missionPropagationProfile.maneuverModelEnabled ? "Enabled" : "Disabled"} />
                  <DetailMetric label="Owner" value={missionPropagationProfile.ownerType.replaceAll("_", " ")} />
                  <DetailMetric label="Updated" value={compactIsoUtc(missionPropagationProfile.updatedAt)} />
                </div>
              ) : !canUseAnalysisConfig ? (
                <p className="mt-3 text-xs leading-5 text-zinc-500">Create or open a mission to view the exact mission propagation profile. Catalog-only analysis configuration is available for backend catalog orbits.</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {analysisPresetOptions.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onApplyPreset(preset.id)}
                        className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${analysisConfig?.config.preset === preset.id ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/25 text-cyan-100 hover:border-cyan-300"}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {analysisModeOptions.map((mode) => {
                      const checked = Boolean(analysisConfig?.config[mode.key]);
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          aria-pressed={checked}
                          onClick={() => onToggleMode(mode.id, !checked)}
                          className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${checked ? "border-lime-300 bg-lime-300/15 text-lime-100" : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-zinc-200"}`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {analysisMessage && <p className="mt-3 text-xs leading-5 text-cyan-100">{analysisMessage}</p>}
            </HudPanel>
          </div>
        )}

        {tab === "maneuver" && (
          <div className="mb-4">
            <OrbitSummaryPanel
              summary={orbitSummary}
              title="Maneuver Orbit Context"
              subtitle="Current orbit state used to interpret maneuver timing and energy."
            />
          </div>
        )}

        {tab === "range" && (
          <HudPanel>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Range Analysis</p>
              <button type="button" aria-pressed={effectiveShowRangeCheck} disabled={!canUseRangeCheck} onClick={onToggleRangeCheck} className="workspace-action">
                {effectiveShowRangeCheck ? "On" : "Off"}
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{rangeMeasurement ? `${rangeMeasurement.primary.satellite.name} -> ${rangeMeasurement.secondary.satellite.name}: ${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "Select two satellites to measure range."}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select value={rangePrimaryId} onChange={(event) => onUpdateRangePrimary(event.target.value)} className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300">
                {!rangePrimaryId && <option value="">Primary: Select satellite</option>}
                {satellites.map((satellite) => <option key={satellite.id} value={satellite.id}>Primary: {satellite.name}</option>)}
              </select>
              <select value={rangeSecondaryId} onChange={(event) => onUpdateRangeSecondary(event.target.value)} className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300">
                {!rangeSecondaryId && <option value="">Secondary: Select satellite</option>}
                {satellites.map((satellite) => <option key={satellite.id} value={satellite.id} disabled={satellite.id === rangePrimaryId}>Secondary: {satellite.name}</option>)}
              </select>
            </div>
          </HudPanel>
        )}

        {tab === "conjunction" && (
          <ConjunctionPanel
            conjunctionSnapshots={conjunctionSnapshots}
            selectedConjunctionId={selectedConjunctionId}
            showConjunctions={showConjunctions}
            disabled={!canShowConjunctions}
            onSelectConjunction={onSelectConjunction}
            onToggleConjunctions={onToggleConjunctions}
          />
        )}

        {tab === "maneuver" && (
          <div className="grid gap-4">
            <HudPanel>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Timeline Burn Summary</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                This view reflects finite and impulsive burn events from the active mission timeline. Legacy maneuver-event overlays are hidden from the operator workflow.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DetailMetric label="Burn Count" value={String(missionBurnEvents.length)} />
                <DetailMetric label="Duration" value={secondsToDurationLabel(totalBurnDuration)} />
                <DetailMetric label="Delta-V" value={`${formatNumber(totalDeltaVMps, 2)} m/s`} />
                <DetailMetric label="Timeline" value={missionBurnEvents.length > 0 ? "Available" : "--"} />
                <DetailMetric label="Finite" value={String(finiteBurnCount)} />
                <DetailMetric label="Impulsive" value={String(impulsiveBurnCount)} />
              </div>
              <div className="mt-3 border border-cyan-300/15 bg-black/20 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Delta-V Contribution</p>
                <div className="mt-2 grid gap-2">
                  {dvBreakdown.length === 0 ? (
                    <p className="text-xs text-zinc-500">No enabled burns to budget.</p>
                  ) : dvBreakdown.map((item) => (
                    <div key={item.key} className="grid gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-zinc-200">{item.label}</span>
                        <span className="font-mono text-[10px] text-cyan-100">{formatNumber(item.deltaVMps, 2)} m/s · {formatNumber(item.percent, 1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-white/10">
                        <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="thin-scrollbar mt-3 max-h-[42vh] space-y-2 overflow-y-scroll pr-1">
                {missionBurnEvents.length === 0 ? (
                  <p className="border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-500">No maneuver burn mission events found.</p>
                ) : (
                  missionBurnEvents.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex).map((event) => (
                    <ManeuverAnalysisCard key={event.id} event={event} />
                  ))
                )}
              </div>
            </HudPanel>
          </div>
        )}

        {tab === "propagation" && (
          <HudPanel>
            {missionPropagationProfile ? (
              <PropagationProfileEditor
                key={`${missionPropagationProfile.id}-${missionPropagationProfile.updatedAt}`}
                profile={missionPropagationProfile}
                capabilities={capabilities}
                status={propagationProfileStatus}
                surface="analysis"
                onDraftChange={onStagePropagationProfile}
              />
            ) : (
              <div className="border border-cyan-300/15 bg-black/20 p-3">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Propagation Setup</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Open or create a mission to inspect and edit the exact mission propagation profile used by trajectory generation.
                </p>
                {visiblePropagationConfig && (
                  <p className="mt-3 text-xs leading-5 text-zinc-400">
                    Catalog fallback currently visible: {visiblePropagationConfig.propagatorType.replaceAll("_", " ")}. Mission trajectory generation uses mission profiles, not this fallback.
                  </p>
                )}
                {propagationProfileStatus && <p className="mt-3 text-xs leading-5 text-zinc-500">{propagationProfileStatus}</p>}
              </div>
            )}
          </HudPanel>
        )}
      </div>
      {tab === "propagation" && missionPropagationProfile && (
        <div className="sticky bottom-0 z-20 mt-3 border-t border-cyan-300/20 bg-[#071016]/95 pt-3 backdrop-blur">
          <button
            type="button"
            onClick={onCommitPropagationProfileDraft}
            disabled={!pendingPropagationProfileUpdate}
            className="w-full border border-cyan-300/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-600"
          >
            {trajectoryOverlay ? "Update Configuration" : "Save Configuration"}
          </button>
        </div>
      )}
    </div>
  );
}

function ManeuverAnalysisCard({ event }: { event: BackendMissionTimelineEvent }) {
  const quality = maneuverQualityAnalysis(event);
  return (
    <div className="border border-rose-300/25 bg-rose-300/[0.04] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{event.name}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{compactIsoUtc(event.executionTime)}</p>
                        </div>
                        <span className="border border-rose-300/40 px-2 py-0.5 font-mono text-[10px] uppercase text-rose-100">
                          {event.type === "IMPULSIVE_BURN" ? "Impulse" : "Finite"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <DetailMetric label={event.type === "IMPULSIVE_BURN" ? "Delta-V" : "Duration"} value={event.type === "IMPULSIVE_BURN" ? `${formatNumber(estimatedEventDeltaVMps(event), 2)} m/s` : `${readNumberParameter(event.parameters ?? {}, "durationSeconds", 0)}s`} />
                        <DetailMetric label={event.type === "IMPULSIVE_BURN" ? "Isp" : "Thrust"} value={event.type === "IMPULSIVE_BURN" ? `${readNumberParameter(event.parameters ?? {}, "ispSeconds", 0)}s` : `${readNumberParameter(event.parameters ?? {}, "thrustNewton", 0)} N`} />
                        <DetailMetric label="Frame" value={readStringParameter(event.parameters ?? {}, "directionFrame", "TNW")} />
                      </div>
      <div className="mt-3 border border-lime-300/15 bg-lime-300/[0.03] p-2">
        <p className="font-mono text-[10px] uppercase text-lime-200">Execution Quality</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <DetailMetric label="Location" value={quality.location} />
          <DetailMetric label="Efficiency" value={quality.efficiency} />
          <DetailMetric label="Alignment" value={quality.alignment} />
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{quality.rationale}</p>
      </div>
    </div>
  );
}

function ConjunctionPanel({
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  disabled,
  onSelectConjunction,
  onToggleConjunctions,
}: {
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  disabled: boolean;
  onSelectConjunction: (conjunctionId: string) => void;
  onToggleConjunctions: () => void;
}) {
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Conjunctions</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Conjunction sync is not yet implemented."
            className="cursor-not-allowed border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-600 opacity-70"
          >
            Coming Soon
          </button>
          <button
            type="button"
            aria-pressed={showConjunctions}
            disabled={disabled}
            onClick={onToggleConjunctions}
            className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
              disabled
                ? "cursor-not-allowed border-white/10 text-zinc-600 opacity-60"
                : showConjunctions
                  ? "border-amber-300 bg-amber-300/15 text-amber-100"
                  : "border-white/10 text-zinc-500 hover:border-amber-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${showConjunctions ? "bg-amber-300" : "bg-zinc-600"}`} />
            {showConjunctions ? "On" : "Off"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {conjunctionSnapshots.length === 0
          ? "No conjunction events found for the loaded satellites."
          : showConjunctions
            ? `${conjunctionSnapshots.length} close-approach pair visible`
            : "Enable to show close-approach links and risk labels."}
      </p>
      {showConjunctions && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Conjunction = a close-approach check between two tracked objects. TCA is the predicted closest-approach time from the backend CDM record.
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
