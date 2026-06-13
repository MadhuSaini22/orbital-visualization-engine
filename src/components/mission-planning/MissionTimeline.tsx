import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BackendCapabilityRegistry, BackendMission, BackendMissionTimelineEvent, BackendPropagationProfile, UpdatePropagationProfileRequest } from "@/services/orbitServerApi";
import { formatNumber, formatUtc } from "@/geometry/format";
import { PropagationProfileEditor } from "./PropagationProfileEditor";
import { OrbitSummaryPanel } from "./OrbitSummaryPanel";
import type { OrbitSummary } from "./OrbitSummaryPanel";
import { DetailMetric, HudPanel } from "./ui";
import type { MissionTrajectoryOverlay, TimelineLayoutModel, TimelineSnapMode, TimelineTimeMode, TimelineZoomPreset, TimelineInteractionModel } from "./types";
import { aerospaceReviewFindings, buildMissionReport, buildTimelineLayoutModel, compactIsoUtc, coverageAnalysis, defaultMissionTrajectoryWindowMinutes, deltaVBreakdown, detectOrbitEventMarkers, displayTimelineTime, estimatedEventDeltaVMps, eventScheduleMode, forceModelSummary, groundStationAccess, integratorSummary, maneuverQualityAnalysis, metOffsetLabelFromSeconds, missionConstraintViolations, missionDurationSeconds, missionObjectiveProgress, missionTargetingSolutions, missionTimelineAnalytics, missionTrajectoryMaxStepSeconds, missionTrajectoryMinStepSeconds, monteCarloDispersion, optimizationCandidates, orbitLifetimeEstimate, readNumberParameter, readStringParameter, relativeMotionAnalysis, secondsToDurationLabel, solveTargetingProblem, spacecraftPerformanceStatus, timelineAnalysis, timelineSnapOptions, timelineZoomOptions, tradeStudySolutions, validateMissionPlan, walkerConstellationAnalysis } from "./utils";
import type { CoverageSettings, GroundStationConfig, MissionConstraints, MissionDesignTargets, MonteCarloSettings, MissionOrbitEventMarker, RelativeMotionSettings, WalkerConstellationConfig } from "./utils";

export function MissionTimelinePanel({
  mission,
  events,
  selectedEventId,
  status,
  canUseMissionTimeline,
  unavailableReason,
  subjectSummary,
  isTrajectoryLoading,
  trajectoryOverlay,
  trajectoryStale,
  propagationProfile,
  capabilities,
  propagationProfileStatus,
  trajectoryCadenceInput,
  trajectoryCadenceError,
  orbitSummary,
  dragEventId,
  simulationTimeIso,
  onInitializeMission,
  onOpenCatalog,
  onOpenWorkspace,
  onOpenTemplates,
  onOpenManeuverTemplates,
  onCreateEvent,
  onEditEvent,
  onDeleteEvent,
  onToggleEvent,
  onSelectEvent,
  onGenerateTrajectory,
  onTrajectoryCadenceChange,
  onStagePropagationProfile,
  onDragEvent,
  onDropEvent,
  onScheduleEvent,
}: {
  mission: BackendMission | null;
  events: BackendMissionTimelineEvent[];
  selectedEventId: string | null;
  status: string | null;
  canUseMissionTimeline: boolean;
  unavailableReason: string | null;
  subjectSummary: { label: string; detail: string };
  isTrajectoryLoading: boolean;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  trajectoryStale: boolean;
  propagationProfile: BackendPropagationProfile | null;
  capabilities: BackendCapabilityRegistry;
  propagationProfileStatus: string | null;
  trajectoryCadenceInput: string;
  trajectoryCadenceError: string | null;
  orbitSummary: OrbitSummary;
  dragEventId: string | null;
  simulationTimeIso: string;
  onInitializeMission: () => void;
  onOpenCatalog: () => void;
  onOpenWorkspace: () => void;
  onOpenTemplates: () => void;
  onOpenManeuverTemplates: () => void;
  onCreateEvent: (type?: "COAST" | "FINITE_BURN" | "IMPULSIVE_BURN") => void;
  onEditEvent: (event: BackendMissionTimelineEvent) => void;
  onDeleteEvent: (event: BackendMissionTimelineEvent) => void;
  onToggleEvent: (event: BackendMissionTimelineEvent) => void;
  onSelectEvent: (eventId: string) => void;
  onGenerateTrajectory: () => void;
  onTrajectoryCadenceChange: (value: string) => void;
  onStagePropagationProfile: (request: UpdatePropagationProfileRequest) => void;
  onDragEvent: (eventId: string | null) => void;
  onDropEvent: (sourceEventId: string, targetEventId: string) => void;
  onScheduleEvent: (event: BackendMissionTimelineEvent, targetMetSeconds: number, snapMode: TimelineSnapMode) => void;
}) {
  const [timeMode, setTimeMode] = useState<TimelineTimeMode>("UTC");
  const [zoomPreset, setZoomPreset] = useState<TimelineZoomPreset>("THREE_HOURS");
  const [customZoomHours, setCustomZoomHours] = useState("3");
  const [snapMode, setSnapMode] = useState<TimelineSnapMode>("FIVE_MIN");
  const [missionTargets, setMissionTargets] = useState<MissionDesignTargets>({
    targetAltitudeKm: 550,
    targetInclinationDeg: null,
    targetEccentricity: 0,
    targetRaanDeg: null,
    targetArgumentOfPerigeeDeg: null,
  });
  const [monteCarloSettings, setMonteCarloSettings] = useState<MonteCarloSettings>({
    samples: 100,
    burnMagnitudeErrorPercent: 1,
    burnDirectionErrorDeg: 0.25,
    timingErrorSeconds: 10,
  });
  const [missionConstraints, setMissionConstraints] = useState<MissionConstraints>({
    maxBurnDurationSeconds: 600,
    maxSingleBurnDeltaVMps: 250,
    fuelReservePercent: 10,
    minPerigeeAltitudeKm: 160,
    maxEclipseDurationSeconds: 2400,
  });
  const [relativeMotionSettings, setRelativeMotionSettings] = useState<RelativeMotionSettings>({
    radialOffsetKm: 0.2,
    alongTrackOffsetKm: 5,
    crossTrackOffsetKm: 0.1,
    relativeDriftMps: -0.05,
  });
  const [groundStation, setGroundStation] = useState<GroundStationConfig>({
    latitudeDeg: 13.73,
    longitudeDeg: 80.23,
    elevationMaskDeg: 10,
  });
  const [coverageSettings, setCoverageSettings] = useState<CoverageSettings>({
    swathWidthKm: 120,
    minimumElevationDeg: 10,
  });
  const [constellationConfig, setConstellationConfig] = useState<WalkerConstellationConfig>({
    pattern: "DELTA",
    satelliteCount: 24,
    planeCount: 6,
    phasing: 1,
    altitudeKm: 550,
    inclinationDeg: 53,
  });
  const interactionModel = useMemo<TimelineInteractionModel>(() => ({
    zoomPreset,
    snapMode,
    customVisibleSeconds: Math.max(60, Number(customZoomHours) * 3600 || 3 * 3600),
  }), [customZoomHours, snapMode, zoomPreset]);
  const analysis = useMemo(() => timelineAnalysis(mission, events), [events, mission]);
  const missionAnalytics = useMemo(() => missionTimelineAnalytics(mission, events, propagationProfile), [events, mission, propagationProfile]);
  const orbitEventMarkers = useMemo(() => detectOrbitEventMarkers(trajectoryOverlay?.mission?.trajectory), [trajectoryOverlay]);
  const dvBreakdown = useMemo(() => deltaVBreakdown(events), [events]);
  const targetingSolutions = useMemo(() => missionTargetingSolutions(orbitSummary, missionTargets, propagationProfile), [missionTargets, orbitSummary, propagationProfile]);
  const objectiveProgress = useMemo(() => missionObjectiveProgress(orbitSummary, missionTargets), [missionTargets, orbitSummary]);
  const dispersion = useMemo(() => monteCarloDispersion(missionAnalytics, monteCarloSettings), [missionAnalytics, monteCarloSettings]);
  const constraintViolations = useMemo(() => missionConstraintViolations(events, missionAnalytics, orbitSummary, orbitEventMarkers, missionConstraints), [events, missionAnalytics, missionConstraints, orbitEventMarkers, orbitSummary]);
  const lifetimeEstimate = useMemo(() => orbitLifetimeEstimate(orbitSummary), [orbitSummary]);
  const tradeStudy = useMemo(() => tradeStudySolutions(targetingSolutions, missionAnalytics), [missionAnalytics, targetingSolutions]);
  const targetSolver = useMemo(() => solveTargetingProblem(orbitSummary, missionTargets, propagationProfile), [missionTargets, orbitSummary, propagationProfile]);
  const maneuverOptimization = useMemo(() => optimizationCandidates(targetSolver, missionAnalytics), [missionAnalytics, targetSolver]);
  const relativeMotion = useMemo(() => relativeMotionAnalysis(trajectoryOverlay, relativeMotionSettings), [relativeMotionSettings, trajectoryOverlay]);
  const stationAccess = useMemo(() => groundStationAccess(trajectoryOverlay, groundStation), [groundStation, trajectoryOverlay]);
  const coverage = useMemo(() => coverageAnalysis(trajectoryOverlay, coverageSettings), [coverageSettings, trajectoryOverlay]);
  const constellation = useMemo(() => walkerConstellationAnalysis(constellationConfig), [constellationConfig]);
  const aerospaceFindings = useMemo(() => aerospaceReviewFindings({
    events,
    orbitSummary,
    profile: propagationProfile,
    solver: targetSolver,
    relativeMotion,
    stationAccess,
    coverage,
    constellation,
  }), [constellation, coverage, events, orbitSummary, propagationProfile, relativeMotion, stationAccess, targetSolver]);
  const templateGroups = useMemo(() => templateEventGroups(events), [events]);
  const missionValidation = useMemo(() => validateMissionPlan(mission, events, propagationProfile), [events, mission, propagationProfile]);
  const validationStatus = missionValidation.errors.length > 0 ? "Blocked" : missionValidation.warnings.length > 0 ? "Review" : "Ready";
  const performanceStatus = spacecraftPerformanceStatus(missionAnalytics.fuelBudget);
  const hasEnabledManeuverEvents = events.some((event) => event.enabled && (event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN"));
  const trajectoryCurrentBlocker = trajectoryOverlay && !trajectoryStale
    ? "Trajectory is current. Change mission configuration, timeline, or cadence to update."
    : null;
  const trajectoryGenerationBlocker = !propagationProfile
    ? "Mission propagation profile is still loading. Configure propagation before generating trajectory."
    : propagationProfile.propagatorType !== "NUMERICAL" && hasEnabledManeuverEvents
      ? `${propagationProfile.propagatorType.replaceAll("_", " ")} propagation cannot execute maneuver mission events. Select Numerical or disable burn events.`
      : missionValidation.errors[0] ?? trajectoryCadenceError ?? trajectoryCurrentBlocker;
  const layoutModel = useMemo(() => mission
    ? buildTimelineLayoutModel(mission, events, interactionModel, selectedEventId, simulationTimeIso)
    : null, [events, interactionModel, mission, selectedEventId, simulationTimeIso]);
  const updateTarget = (key: keyof MissionDesignTargets, value: string) => {
    const parsed = Number(value);
    setMissionTargets((current) => ({ ...current, [key]: value.trim() === "" || !Number.isFinite(parsed) ? null : parsed }));
  };
  const updateMonteCarlo = (key: keyof MonteCarloSettings, value: string) => {
    const parsed = Number(value);
    setMonteCarloSettings((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const updateConstraint = (key: keyof MissionConstraints, value: string) => {
    const parsed = Number(value);
    setMissionConstraints((current) => ({ ...current, [key]: value.trim() === "" || !Number.isFinite(parsed) ? null : parsed }));
  };
  const updateRelativeMotion = (key: keyof RelativeMotionSettings, value: string) => {
    const parsed = Number(value);
    setRelativeMotionSettings((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const updateGroundStation = (key: keyof GroundStationConfig, value: string) => {
    const parsed = Number(value);
    setGroundStation((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const updateCoverage = (key: keyof CoverageSettings, value: string) => {
    const parsed = Number(value);
    setCoverageSettings((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const updateConstellation = (key: keyof WalkerConstellationConfig, value: string) => {
    if (key === "pattern") {
      setConstellationConfig((current) => ({ ...current, pattern: value === "STAR" ? "STAR" : "DELTA" }));
      return;
    }
    const parsed = Number(value);
    setConstellationConfig((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };

  return (
    <HudPanel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Timeline</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">{mission ? mission.name : "No mission"}</p>
        </div>
        {!mission ? (
          <div className="flex items-center gap-1.5">
            {!canUseMissionTimeline && (
              <button
                type="button"
                onClick={onOpenCatalog}
                className="border border-cyan-300/45 px-3 py-1.5 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10"
              >
                Catalog
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenManeuverTemplates}
              className="border border-cyan-300/45 px-2 py-1.5 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10"
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => onCreateEvent("COAST")}
              className="border border-white/15 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
            >
              Coast
            </button>
            <button
              type="button"
              onClick={() => onCreateEvent("FINITE_BURN")}
              className="border border-rose-300/50 px-2 py-1.5 font-mono text-[10px] uppercase text-rose-100 transition hover:border-rose-300 hover:bg-rose-300/10"
            >
              Finite
            </button>
            <button
              type="button"
              onClick={() => onCreateEvent("IMPULSIVE_BURN")}
              className="border border-amber-300/50 px-2 py-1.5 font-mono text-[10px] uppercase text-amber-100 transition hover:border-amber-300 hover:bg-amber-300/10"
            >
              Impulse
            </button>
          </div>
        )}
      </div>

      {!mission && (
        <div className={`mt-3 border p-3 text-xs leading-5 ${
          canUseMissionTimeline
            ? "border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-100"
            : "border-amber-300/20 bg-amber-300/[0.04] text-amber-100"
        }`}>
          {canUseMissionTimeline ? (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">Mission Planning Setup</p>
                <p className="mt-1 text-emerald-100/85">Create a mission window first, then add Coast and Finite Burn events inside that scenario.</p>
              </div>
              <div className="grid gap-2 border border-emerald-300/15 bg-black/20 p-2 text-[11px]">
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Subject</span>
                  <span className="text-right">{subjectSummary.label}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Next Step</span>
                  <span className="text-right">Define mission name and UTC window</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                <button type="button" onClick={onInitializeMission} className="border border-emerald-300/50 px-3 py-2 font-mono text-[10px] uppercase text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10">
                  Create Mission
                </button>
                <button type="button" onClick={onOpenTemplates} className="border border-cyan-300/40 px-3 py-2 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10">
                  From Template
                </button>
                <button type="button" onClick={onOpenWorkspace} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
                  Import/Open
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p>{unavailableReason}</p>
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <button type="button" onClick={onOpenCatalog} className="border border-cyan-300/45 px-3 py-2 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10">
                  Load Catalog
                </button>
                <button type="button" onClick={onOpenWorkspace} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
                  Workspace
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Summary</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">High-level mission cost, timeline, and validation state before trajectory generation.</p>
            </div>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
              validationStatus === "Blocked"
                ? "border-rose-300/40 text-rose-100"
                : validationStatus === "Review"
                  ? "border-amber-300/40 text-amber-100"
                  : "border-lime-300/40 text-lime-100"
            }`}>
              {validationStatus}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <DetailMetric label="Mission Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
            <DetailMetric label="Events" value={`${analysis.eventCount} total`} />
            <DetailMetric label="Burns" value={`${missionAnalytics.burnCount} burns`} />
            <DetailMetric label="Total Delta-V" value={`${formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s`} />
            <DetailMetric label="Estimated Fuel Used" value={`${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} kg`} />
            <DetailMetric label="Fuel Remaining" value={missionAnalytics.fuelBudget.remainingFuelKg == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.remainingFuelKg, 3)} kg`} />
            <DetailMetric label="Remaining Delta-V" value={missionAnalytics.fuelBudget.remainingDeltaVMps == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.remainingDeltaVMps, 2)} m/s`} />
            <DetailMetric label="Orbit Class" value={orbitSummary.classification} />
            <DetailMetric label="Spacecraft Status" value={performanceStatus} />
          </div>
          {missionAnalytics.fuelBudget.warnings.length > 0 && (
            <div className="mt-3 border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2">
              {missionAnalytics.fuelBudget.warnings.map((warning) => (
                <p key={warning} className="text-xs leading-5 text-amber-100">{warning}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-2 border border-cyan-300/15 bg-black/25 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Subject</span>
            <span className="text-right text-zinc-200">{subjectSummary.label}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Identifier</span>
            <span className="text-right font-mono text-[10px] text-zinc-400">{subjectSummary.detail}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Start UTC</span>
            <span className="font-mono text-[10px] text-zinc-200">{compactIsoUtc(mission.scenarioStart)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">End UTC</span>
            <span className="font-mono text-[10px] text-zinc-200">{compactIsoUtc(mission.scenarioEnd)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Duration</span>
            <span className="text-zinc-200">{secondsToDurationLabel(missionDurationSeconds(mission))}</span>
          </div>
          <div className="border-t border-white/10 pt-2 text-[11px] leading-5 text-zinc-500">
            Trajectory generation currently uses a separate preview window centered on the simulation clock.
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3">
          <OrbitSummaryPanel
            summary={orbitSummary}
            title="Current Orbit"
            subtitle="Mission planner context for transfer, circularization, and plane-change decisions."
          />
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-rose-300/20 bg-rose-300/[0.035] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-rose-200">Aerospace Engineering Review</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Brutal flight-dynamics audit: flags screening-only analyses, missing backend Orekit capabilities, and operations risks.</p>
            </div>
            <span className="border border-rose-300/35 px-2 py-1 font-mono text-[10px] uppercase text-rose-100">
              {aerospaceFindings.filter((finding) => finding.severity === "Critical").length} Critical
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {aerospaceFindings.slice(0, 6).map((finding) => (
              <div key={`${finding.area}-${finding.finding}`} className={`border px-3 py-2 ${
                finding.severity === "Critical"
                  ? "border-rose-300/30 bg-rose-300/[0.06]"
                  : finding.severity === "Warning"
                    ? "border-amber-300/25 bg-amber-300/[0.045]"
                    : "border-cyan-300/20 bg-cyan-300/[0.035]"
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">{finding.area}</p>
                  <p className="font-mono text-[10px] uppercase text-zinc-400">{finding.status} · {finding.severity}</p>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">{finding.finding}</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">{finding.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Differential Corrector</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Screening-level target solver that combines closed-form maneuver estimates and residual damping.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                targetSolver.status === "Converged"
                  ? "border-lime-300/40 text-lime-100"
                  : targetSolver.status === "Partial"
                    ? "border-amber-300/40 text-amber-100"
                    : targetSolver.status === "Needs High-Fidelity Solve"
                      ? "border-rose-300/40 text-rose-100"
                      : "border-white/15 text-zinc-500"
              }`}>
                {targetSolver.status}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Iterations" value={String(targetSolver.iterations)} />
              <DetailMetric label="Solved Delta-V" value={`${formatNumber(targetSolver.totalDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Solved Fuel" value={`${formatNumber(targetSolver.estimatedFuelKg, 3)} kg`} />
              <DetailMetric label="Plan Steps" value={String(targetSolver.plan.length)} />
            </div>
            <div className="mt-3 grid gap-2">
              {targetSolver.residuals.length === 0 ? (
                <p className="border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">No active target residuals. Add targeting objectives above.</p>
              ) : targetSolver.residuals.map((residual) => (
                <div key={residual.parameter} className="grid gap-2 border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-zinc-100">{residual.parameter}</span>
                    <span className="font-mono text-[10px] text-cyan-100">
                      residual {formatNumber(Math.abs(residual.finalError), residual.unit ? 3 : 6)} {residual.unit}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-500">
                    initial {formatNumber(residual.initialError, residual.unit ? 3 : 6)} {residual.unit} · tolerance {formatNumber(residual.tolerance, residual.unit ? 3 : 6)} {residual.unit}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {targetSolver.plan.slice(0, 5).map((step) => (
                <div key={`${step.name}-${step.location}`} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/20 px-3 py-2">
                  <span className="text-xs text-zinc-100">{step.name}</span>
                  <span className="font-mono text-[10px] text-zinc-400">{step.type.replaceAll("_", " ")} · {formatNumber(step.deltaVMps, 2)} m/s · {step.location}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{targetSolver.rationale}</p>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Maneuver Optimization</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Ranks solved candidate strategies by delta-v, fuel, transfer time, and residual quality.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {maneuverOptimization.length} Modes
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {maneuverOptimization.map((candidate) => (
                <div key={candidate.mode} className="grid gap-2 border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">#{candidate.rank} {candidate.mode}</p>
                    <p className="font-mono text-[10px] text-cyan-100">{formatNumber(candidate.deltaVMps, 2)} m/s · {formatNumber(candidate.fuelKg, 3)} kg</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <DetailMetric label="Transfer Time" value={secondsToDurationLabel(candidate.transferSeconds)} />
                    <DetailMetric label="Residual Score" value={formatNumber(candidate.residualScore, 2)} />
                  </div>
                  <p className="text-[11px] leading-5 text-zinc-500">{candidate.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Maneuver Targeting Engine</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">First-order targeting advisor for altitude, inclination, eccentricity, RAAN, and argument of perigee.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {targetingSolutions.length} Solutions
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              <TargetInput label="Altitude km" value={missionTargets.targetAltitudeKm} onChange={(value) => updateTarget("targetAltitudeKm", value)} />
              <TargetInput label="Inclination deg" value={missionTargets.targetInclinationDeg} onChange={(value) => updateTarget("targetInclinationDeg", value)} />
              <TargetInput label="Eccentricity" value={missionTargets.targetEccentricity} onChange={(value) => updateTarget("targetEccentricity", value)} />
              <TargetInput label="RAAN deg" value={missionTargets.targetRaanDeg} onChange={(value) => updateTarget("targetRaanDeg", value)} />
              <TargetInput label="Arg Perigee deg" value={missionTargets.targetArgumentOfPerigeeDeg} onChange={(value) => updateTarget("targetArgumentOfPerigeeDeg", value)} />
            </div>
            <div className="mt-3 grid gap-2">
              {targetingSolutions.length === 0 ? (
                <p className="border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">Enter a target objective to generate first-order maneuver estimates.</p>
              ) : targetingSolutions.slice(0, 4).map((solution) => (
                <div key={solution.id} className="border border-white/10 bg-black/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">{solution.target}</p>
                    <p className="font-mono text-[10px] text-cyan-100">{formatNumber(solution.requiredDeltaVMps, 2)} m/s · {formatNumber(solution.estimatedFuelKg, 3)} kg</p>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <DetailMetric label="Current" value={solution.current} />
                    <DetailMetric label="Target" value={solution.desired} />
                    <DetailMetric label="Method" value={`${solution.method} · ${solution.confidence}`} />
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-zinc-500">{solution.rationale}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Objectives & Lifetime</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Objective progress and first-order LEO decay classification.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                lifetimeEstimate.classification === "Reentry Risk"
                  ? "border-rose-300/40 text-rose-100"
                  : lifetimeEstimate.classification === "Decaying"
                    ? "border-amber-300/40 text-amber-100"
                    : lifetimeEstimate.classification === "Stable"
                      ? "border-lime-300/40 text-lime-100"
                      : "border-white/15 text-zinc-500"
              }`}>
                {lifetimeEstimate.classification}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {objectiveProgress.length === 0 ? (
                <p className="border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">No active objectives. Add targets in the targeting panel.</p>
              ) : objectiveProgress.map((objective) => (
                <div key={objective.label} className="grid gap-2 border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-100">{objective.label}</span>
                    <span className="font-mono text-[10px] uppercase text-cyan-100">{objective.status}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden bg-white/10">
                    <div className="h-full bg-lime-300" style={{ width: `${objective.progressPercent}%` }} />
                  </div>
                  <p className="font-mono text-[10px] text-zinc-500">{objective.current} to {objective.target}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <DetailMetric label="Lifetime" value={lifetimeEstimate.estimatedLifetime} />
              <DetailMetric label="Drag Sensitivity" value={lifetimeEstimate.dragSensitivity} />
              <DetailMetric label="Perigee" value={orbitSummary.perigeeAltitudeKm == null ? "Unavailable" : `${formatNumber(orbitSummary.perigeeAltitudeKm, 2)} km`} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{lifetimeEstimate.rationale}</p>
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Monte Carlo Dispersion</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Deterministic screening model for burn magnitude, pointing, and timing uncertainty.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                dispersion.robustness === "Fragile" ? "border-rose-300/40 text-rose-100" : dispersion.robustness === "Sensitive" ? "border-amber-300/40 text-amber-100" : "border-lime-300/40 text-lime-100"
              }`}>
                {dispersion.robustness}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <TargetInput label="Samples" value={monteCarloSettings.samples} onChange={(value) => updateMonteCarlo("samples", value)} />
              <TargetInput label="Mag err %" value={monteCarloSettings.burnMagnitudeErrorPercent} onChange={(value) => updateMonteCarlo("burnMagnitudeErrorPercent", value)} />
              <TargetInput label="Dir err deg" value={monteCarloSettings.burnDirectionErrorDeg} onChange={(value) => updateMonteCarlo("burnDirectionErrorDeg", value)} />
              <TargetInput label="Timing err s" value={monteCarloSettings.timingErrorSeconds} onChange={(value) => updateMonteCarlo("timingErrorSeconds", value)} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Best Case" value={`${formatNumber(dispersion.bestCaseDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Average" value={`${formatNumber(dispersion.averageDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Worst Case" value={`${formatNumber(dispersion.worstCaseDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Orbit Spread" value={`${formatNumber(dispersion.orbitSpreadKm, 2)} km`} />
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Constraints & Trade Study</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Operational constraints plus ranked candidate design strategies.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${constraintViolations.length > 0 ? "border-amber-300/40 text-amber-100" : "border-lime-300/40 text-lime-100"}`}>
                {constraintViolations.length} Findings
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              <TargetInput label="Max burn s" value={missionConstraints.maxBurnDurationSeconds} onChange={(value) => updateConstraint("maxBurnDurationSeconds", value)} />
              <TargetInput label="Max dV m/s" value={missionConstraints.maxSingleBurnDeltaVMps} onChange={(value) => updateConstraint("maxSingleBurnDeltaVMps", value)} />
              <TargetInput label="Reserve %" value={missionConstraints.fuelReservePercent} onChange={(value) => updateConstraint("fuelReservePercent", value)} />
              <TargetInput label="Min perigee km" value={missionConstraints.minPerigeeAltitudeKm} onChange={(value) => updateConstraint("minPerigeeAltitudeKm", value)} />
              <TargetInput label="Max eclipse s" value={missionConstraints.maxEclipseDurationSeconds} onChange={(value) => updateConstraint("maxEclipseDurationSeconds", value)} />
            </div>
            <div className="mt-3 grid gap-2">
              {constraintViolations.length === 0 ? (
                <p className="border border-lime-300/15 bg-lime-300/[0.03] px-3 py-2 text-xs text-lime-100">No active constraint violations detected.</p>
              ) : constraintViolations.map((violation) => (
                <p key={`${violation.constraint}-${violation.message}`} className={`border px-3 py-2 text-xs leading-5 ${violation.severity === "Violation" ? "border-rose-300/30 bg-rose-300/[0.06] text-rose-100" : "border-amber-300/30 bg-amber-300/[0.06] text-amber-100"}`}>
                  {violation.constraint}: {violation.message}
                </p>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {tradeStudy.slice(0, 4).map((candidate) => (
                <div key={candidate.label} className="grid gap-2 border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white">#{candidate.rank} {candidate.label}</p>
                    <p className="font-mono text-[10px] text-cyan-100">{formatNumber(candidate.deltaVMps, 2)} m/s · {secondsToDurationLabel(candidate.transferSeconds)}</p>
                  </div>
                  <p className="text-[11px] leading-5 text-zinc-500">{candidate.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Relative Motion & Ground Access</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Rendezvous screening with a modeled deputy plus ground station pass prediction.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {relativeMotion.separationTrend}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <TargetInput label="Radial km" value={relativeMotionSettings.radialOffsetKm} onChange={(value) => updateRelativeMotion("radialOffsetKm", value)} />
              <TargetInput label="Along km" value={relativeMotionSettings.alongTrackOffsetKm} onChange={(value) => updateRelativeMotion("alongTrackOffsetKm", value)} />
              <TargetInput label="Cross km" value={relativeMotionSettings.crossTrackOffsetKm} onChange={(value) => updateRelativeMotion("crossTrackOffsetKm", value)} />
              <TargetInput label="Drift m/s" value={relativeMotionSettings.relativeDriftMps} onChange={(value) => updateRelativeMotion("relativeDriftMps", value)} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Initial Sep" value={`${formatNumber(relativeMotion.relativePositionKm, 3)} km`} />
              <DetailMetric label="Rel Velocity" value={`${formatNumber(relativeMotion.relativeVelocityMps, 3)} m/s`} />
              <DetailMetric label="Closest Approach" value={`${formatNumber(relativeMotion.closestApproachKm, 3)} km`} />
              <DetailMetric label="CA Time" value={relativeMotion.closestApproachTimeUtc ? compactIsoUtc(relativeMotion.closestApproachTimeUtc) : "Generate trajectory"} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{relativeMotion.rationale}</p>

            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="grid gap-2 md:grid-cols-3">
                <TargetInput label="Station lat" value={groundStation.latitudeDeg} onChange={(value) => updateGroundStation("latitudeDeg", value)} />
                <TargetInput label="Station lon" value={groundStation.longitudeDeg} onChange={(value) => updateGroundStation("longitudeDeg", value)} />
                <TargetInput label="Mask deg" value={groundStation.elevationMaskDeg} onChange={(value) => updateGroundStation("elevationMaskDeg", value)} />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <DetailMetric label="Next Pass" value={stationAccess.nextPassStartUtc ? compactIsoUtc(stationAccess.nextPassStartUtc) : "No pass"} />
                <DetailMetric label="Duration" value={secondsToDurationLabel(stationAccess.passDurationSeconds)} />
                <DetailMetric label="Max Elevation" value={`${formatNumber(stationAccess.maxElevationDeg, 2)} deg`} />
                <DetailMetric label="Pass Count" value={String(stationAccess.accessCount)} />
              </div>
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Coverage & Constellation</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Earth-observation coverage screening and basic Walker constellation geometry.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${constellation.valid ? "border-lime-300/40 text-lime-100" : "border-amber-300/40 text-amber-100"}`}>
                Walker {constellation.valid ? "Valid" : "Review"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <TargetInput label="Swath km" value={coverageSettings.swathWidthKm} onChange={(value) => updateCoverage("swathWidthKm", value)} />
              <TargetInput label="Min elev deg" value={coverageSettings.minimumElevationDeg} onChange={(value) => updateCoverage("minimumElevationDeg", value)} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <DetailMetric label="Coverage" value={`${formatNumber(coverage.approximateCoveragePercent, 2)}%`} />
              <DetailMetric label="Opportunities" value={String(coverage.accessOpportunities)} />
              <DetailMetric label="Revisit" value={coverage.revisitTimeSeconds == null ? "Generate trajectory" : secondsToDurationLabel(coverage.revisitTimeSeconds)} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{coverage.rationale}</p>

            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="grid gap-2 md:grid-cols-6">
                <label className="grid gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-300/60">Pattern</span>
                  <select
                    value={constellationConfig.pattern}
                    onChange={(event) => updateConstellation("pattern", event.target.value)}
                    className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[11px] text-cyan-100 outline-none"
                  >
                    <option value="DELTA">Walker Delta</option>
                    <option value="STAR">Walker Star</option>
                  </select>
                </label>
                <TargetInput label="Sats" value={constellationConfig.satelliteCount} onChange={(value) => updateConstellation("satelliteCount", value)} />
                <TargetInput label="Planes" value={constellationConfig.planeCount} onChange={(value) => updateConstellation("planeCount", value)} />
                <TargetInput label="Phasing" value={constellationConfig.phasing} onChange={(value) => updateConstellation("phasing", value)} />
                <TargetInput label="Alt km" value={constellationConfig.altitudeKm} onChange={(value) => updateConstellation("altitudeKm", value)} />
                <TargetInput label="Inc deg" value={constellationConfig.inclinationDeg} onChange={(value) => updateConstellation("inclinationDeg", value)} />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <DetailMetric label="Sats/Plane" value={String(constellation.satellitesPerPlane)} />
                <DetailMetric label="RAAN Spacing" value={`${formatNumber(constellation.raanSpacingDeg, 2)} deg`} />
                <DetailMetric label="In-Plane Spacing" value={`${formatNumber(constellation.inPlaneSpacingDeg, 2)} deg`} />
                <DetailMetric label="Phase" value={`${formatNumber(constellation.relativePhaseDeg, 2)} deg`} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">{constellation.summary}</p>
            </div>
          </div>
        </div>
      )}

      {mission && templateGroups.length > 0 && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Generated Maneuver Sequences</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Events sharing a template instance are grouped for traceability; generated events remain editable below.</p>
            </div>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              {templateGroups.length} Sequences
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {templateGroups.map((group) => (
              <TemplateGroupSummary key={group.templateInstanceId} group={group} />
            ))}
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Delta-V Budget</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Mission-wide maneuver cost by template family.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {dvBreakdown.length === 0 ? (
                <p className="border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">No enabled burn events in the current mission timeline.</p>
              ) : dvBreakdown.map((item) => (
                <div key={item.key} className="grid gap-2 border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-zinc-100">{item.label}</span>
                    <span className="font-mono text-[10px] text-cyan-100">{formatNumber(item.deltaVMps, 2)} m/s · {formatNumber(item.percent, 1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden bg-white/10">
                    <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                  </div>
                  <p className="font-mono text-[10px] uppercase text-zinc-600">{item.burnCount} burn{item.burnCount === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Spacecraft Performance</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Capability check from the active propagation profile and planned burns.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                performanceStatus === "Critical"
                  ? "border-rose-300/40 text-rose-100"
                  : performanceStatus === "Caution"
                    ? "border-amber-300/40 text-amber-100"
                    : performanceStatus === "Healthy"
                      ? "border-lime-300/40 text-lime-100"
                      : "border-white/15 text-zinc-500"
              }`}>
                {performanceStatus}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <DetailMetric label="Current Mass" value={missionAnalytics.fuelBudget.initialMassKg == null ? "Profile not loaded" : `${formatNumber(Math.max((missionAnalytics.fuelBudget.initialMassKg ?? 0) - missionAnalytics.fuelBudget.consumedFuelKg, missionAnalytics.fuelBudget.dryMassKg ?? 0), 3)} kg`} />
              <DetailMetric label="Dry Mass" value={missionAnalytics.fuelBudget.dryMassKg == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.dryMassKg, 3)} kg`} />
              <DetailMetric label="Remaining Propellant" value={missionAnalytics.fuelBudget.remainingFuelKg == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.remainingFuelKg, 3)} kg`} />
              <DetailMetric label="Mission Margin" value={missionAnalytics.fuelBudget.fuelMarginPercent == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.fuelMarginPercent, 1)}%`} />
            </div>
            <button
              type="button"
              onClick={() => exportMissionReport({ mission, events, orbitSummary, propagationProfile, trajectoryOverlay, missionValidation, missionTargets, missionConstraints, monteCarloSettings, relativeMotionSettings, groundStation, coverageSettings, constellationConfig })}
              className="mt-3 w-full border border-cyan-300/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950"
            >
              Export Mission Report JSON
            </button>
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Orbit Event Detection</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Derived from generated trajectory samples: apsides, node crossings, and low-order eclipse estimates.</p>
            </div>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              {orbitEventMarkers.length} Markers
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {orbitEventMarkers.length === 0 ? (
              <p className="border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500 md:col-span-2">Generate a trajectory to detect perigee, apogee, node, and eclipse events.</p>
            ) : orbitEventMarkers.slice(0, 8).map((marker) => (
              <div key={marker.id} className="border border-white/10 bg-black/20 p-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase text-cyan-100">{marker.type.replaceAll("_", " ")}</p>
                  <p className="font-mono text-[10px] text-zinc-500">{compactIsoUtc(marker.timeUtc)}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-300">Alt {formatNumber(marker.altitudeKm, 2)} km · Lat {formatNumber(marker.latitudeDeg, 2)} deg · Lon {formatNumber(marker.longitudeDeg, 2)} deg</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">{marker.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          {propagationProfile ? (
            <PropagationProfileEditor
              key={`planner-${propagationProfile.id}-${propagationProfile.updatedAt}`}
              profile={propagationProfile}
              capabilities={capabilities}
              status={propagationProfileStatus}
              surface="planner"
              defaultShowAdvanced
              defaultShowExpert
              onDraftChange={onStagePropagationProfile}
            />
          ) : (
            <div className="border border-amber-300/25 bg-amber-300/[0.05] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200">Mission Definition Incomplete</p>
              <p className="mt-2 text-xs leading-5 text-amber-100">
                Mission propagation profile is still loading. Propagator, force models, spacecraft parameters, integrator settings, and cadence must be visible before the first trajectory run.
              </p>
            </div>
          )}
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Run Summary</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                Configuration that will be sent to the backend trajectory endpoint and used to build the Orekit propagation context.
              </p>
            </div>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${trajectoryStale ? "border-amber-300/40 text-amber-100" : trajectoryOverlay ? "border-lime-300/40 text-lime-100" : "border-white/15 text-zinc-400"}`}>
              {trajectoryStale ? "Stale Trajectory" : trajectoryOverlay ? "Generated" : "Not Run"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <DetailMetric label="Mission Subject" value={subjectSummary.label} />
            <DetailMetric label="Orbit Source" value={subjectSummary.detail} />
            <DetailMetric label="Propagator" value={propagationProfile?.propagatorType.replaceAll("_", " ") ?? mission.propagatorType.replaceAll("_", " ")} />
            <DetailMetric label="Integrator" value={integratorSummary(propagationProfile, capabilities)} />
            <DetailMetric label="Force Models" value={forceModelSummary(propagationProfile)} />
            <DetailMetric label="Spacecraft" value={propagationProfile ? `Dry ${propagationProfile.dryMassKg} kg · Fuel ${propagationProfile.fuelMassKg} kg` : "Profile not loaded"} />
            <DetailMetric label="Mission Window" value={`${compactIsoUtc(mission.scenarioStart)} -> ${compactIsoUtc(mission.scenarioEnd)}`} />
            <DetailMetric label="Timeline" value={`${analysis.burnCount} Burns · ${analysis.coastCount} Coasts · ${analysis.eventCount} Events`} />
            <DetailMetric label="Fuel Budget" value={missionAnalytics.fuelBudget.initialFuelKg == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} / ${formatNumber(missionAnalytics.fuelBudget.initialFuelKg, 3)} kg`} />
            <DetailMetric label="Fuel Margin" value={missionAnalytics.fuelBudget.fuelMarginPercent == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.fuelMarginPercent, 1)}%`} />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr]">
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Trajectory Sample Cadence</span>
              <input
                value={trajectoryCadenceInput}
                onChange={(event) => onTrajectoryCadenceChange(event.target.value)}
                inputMode="numeric"
                className={`border bg-black/45 px-3 py-2 font-mono text-sm outline-none ${trajectoryCadenceError ? "border-rose-300/60 text-rose-100" : "border-cyan-300/25 text-cyan-100"}`}
                aria-invalid={Boolean(trajectoryCadenceError)}
              />
              <span className={trajectoryCadenceError ? "text-xs text-rose-100" : "text-xs text-zinc-500"}>
                {trajectoryCadenceError ?? `Allowed range: ${missionTrajectoryMinStepSeconds}-${missionTrajectoryMaxStepSeconds} seconds. This exact value is sent to the trajectory API.`}
              </span>
            </label>
            <div className="grid gap-2 border border-white/10 bg-black/20 p-2 text-xs">
              <DetailMetric label="Trajectory Duration" value={`${defaultMissionTrajectoryWindowMinutes * 2} min preview window`} />
              <DetailMetric label="Profile Revision" value={propagationProfile?.updatedAt ? compactIsoUtc(propagationProfile.updatedAt) : "Profile not loaded"} />
            </div>
          </div>
          {trajectoryStale && (
            <div className="mt-3 border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
              Mission configuration changed. Regenerate trajectory.
            </div>
          )}
          {(missionValidation.errors.length > 0 || missionValidation.warnings.length > 0) && (
            <div className={`mt-3 border px-3 py-2 ${missionValidation.errors.length > 0 ? "border-rose-300/30 bg-rose-300/[0.06]" : "border-amber-300/30 bg-amber-300/[0.06]"}`}>
              <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${missionValidation.errors.length > 0 ? "text-rose-100" : "text-amber-100"}`}>
                Mission Validation
              </p>
              <div className="mt-2 space-y-1">
                {missionValidation.errors.map((message) => (
                  <p key={message} className="text-xs leading-5 text-rose-100">{message}</p>
                ))}
                {missionValidation.warnings.map((message) => (
                  <p key={message} className="text-xs leading-5 text-amber-100">{message}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Visual Mission Timeline</p>
              <p className="mt-1 text-[11px] text-zinc-500">Drag blocks left/right to reschedule. Backend execution remains UTC-based.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <div className="grid grid-cols-2 border border-cyan-300/20">
                {(["UTC", "MET"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTimeMode(mode)}
                    className={`px-2 py-1.5 font-mono text-[10px] uppercase transition ${
                      timeMode === mode
                        ? "bg-cyan-300 text-slate-950"
                        : "text-cyan-200 hover:bg-cyan-300/10"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <select value={zoomPreset} onChange={(event) => setZoomPreset(event.target.value as TimelineZoomPreset)} className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[10px] uppercase text-cyan-100 outline-none">
                {timelineZoomOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as TimelineSnapMode)} className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[10px] uppercase text-cyan-100 outline-none">
                {timelineSnapOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </div>
          {zoomPreset === "CUSTOM" && (
            <label className="mt-2 flex items-center justify-end gap-2 font-mono text-[10px] uppercase text-zinc-500">
              Visible hours
              <input
                value={customZoomHours}
                onChange={(event) => setCustomZoomHours(event.target.value)}
                inputMode="decimal"
                className="w-20 border border-cyan-300/20 bg-black/45 px-2 py-1.5 text-cyan-100 outline-none"
              />
            </label>
          )}

          {layoutModel && (
          <VisualMissionTimeline
            mission={mission}
            layout={layoutModel}
            orbitMarkers={orbitEventMarkers}
            timeMode={timeMode}
            selectedEventId={selectedEventId}
            onSelectEvent={onSelectEvent}
            onScheduleEvent={(event, targetMetSeconds) => onScheduleEvent(event, targetMetSeconds, snapMode)}
          />
          )}

          <div className="mt-3 grid grid-cols-6 gap-2 max-sm:grid-cols-2">
            <TimelineMetric label="Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
            <TimelineMetric label="Events" value={String(analysis.eventCount)} />
            <TimelineMetric label="Burns" value={String(analysis.burnCount)} />
            <TimelineMetric label="Finite" value={String(analysis.finiteBurnCount)} />
            <TimelineMetric label="Impulsive" value={String(analysis.impulsiveBurnCount)} />
            <TimelineMetric label="Est dV" value={`${formatNumber(analysis.cumulativeDeltaVMps, 2)} m/s`} />
            <TimelineMetric label="Coasts" value={String(analysis.coastCount)} />
            <TimelineMetric label="Coast Time" value={secondsToDurationLabel(missionAnalytics.totalCoastSeconds)} />
            <TimelineMetric label="Burn Time" value={secondsToDurationLabel(missionAnalytics.totalBurnTimeSeconds)} />
            <TimelineMetric label="Avg dV/Burn" value={`${formatNumber(missionAnalytics.averageDeltaVMps, 2)} m/s`} />
            <TimelineMetric label="Fuel Used" value={`${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} kg`} />
            <TimelineMetric label="Rem dV" value={missionAnalytics.fuelBudget.remainingDeltaVMps == null ? "--" : `${formatNumber(missionAnalytics.fuelBudget.remainingDeltaVMps, 1)} m/s`} />
          </div>

          {analysis.warnings.length > 0 && (
            <div className="mt-3 border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200">Timeline Warnings</p>
              <div className="mt-2 space-y-1">
                {analysis.warnings.map((warning) => (
                  <p key={warning} className="text-xs leading-5 text-amber-100">{warning}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="thin-scrollbar mt-3 max-h-[34vh] space-y-2 overflow-y-scroll pr-1">
        {events.map((event, index) => (
          <TimelineEventCard
            key={event.id}
            event={event}
            index={index}
            selected={selectedEventId === event.id}
            dragging={dragEventId === event.id}
            onSelect={() => onSelectEvent(event.id)}
            onEdit={() => onEditEvent(event)}
            onDelete={() => onDeleteEvent(event)}
            onToggle={() => onToggleEvent(event)}
            onDragStart={() => onDragEvent(event.id)}
            onDragEnd={() => onDragEvent(null)}
            onDrop={() => {
              if (dragEventId) {
                onDropEvent(dragEventId, event.id);
              }
              onDragEvent(null);
            }}
          />
        ))}
      </div>

      {mission && (
        <div className="sticky bottom-0 z-20 mt-3 border-t border-cyan-300/20 bg-[#071016]/95 pt-3 backdrop-blur">
          <button
            type="button"
            onClick={onGenerateTrajectory}
            disabled={isTrajectoryLoading || Boolean(trajectoryGenerationBlocker)}
            title={trajectoryGenerationBlocker ?? "Generate trajectory using the displayed mission run configuration."}
            className={`w-full border border-cyan-300 bg-cyan-300 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60 ${isTrajectoryLoading ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"}`}
          >
            {isTrajectoryLoading ? "Generating" : trajectoryOverlay ? "Update Trajectory" : "Generate Trajectory"}
          </button>
        </div>
      )}

      {trajectoryOverlay && (
        <div className="mt-3 border border-lime-300/20 bg-lime-300/[0.04] px-3 py-2">
          <p className="font-mono text-[10px] uppercase text-lime-200">Trajectory Ready</p>
          <p className="mt-1 text-xs text-zinc-400">{trajectoryOverlay.message}</p>
        </div>
      )}

      {status && (
        <p className="mt-3 border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-300">{status}</p>
      )}
    </HudPanel>
  );
}

function VisualMissionTimeline({
  mission,
  layout,
  orbitMarkers,
  timeMode,
  selectedEventId,
  onSelectEvent,
  onScheduleEvent,
}: {
  mission: BackendMission;
  layout: TimelineLayoutModel;
  orbitMarkers: MissionOrbitEventMarker[];
  timeMode: TimelineTimeMode;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onScheduleEvent: (event: BackendMissionTimelineEvent, targetMetSeconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    eventId: string;
    startClientX: number;
    startMetSeconds: number;
    previewMetSeconds: number;
  } | null>(null);
  const eventNameById = useMemo(() => {
    return new Map(layout.blocks.map(({ event }) => [event.id, event.name]));
  }, [layout.blocks]);

  const previewByEventId = dragState ? new Map([[dragState.eventId, dragState.previewMetSeconds]]) : new Map<string, number>();

  const updateDragPreview = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || !trackRef.current) {
      return;
    }
    const width = trackRef.current.getBoundingClientRect().width;
    if (width <= 0) {
      return;
    }
    const deltaSeconds = ((pointerEvent.clientX - dragState.startClientX) / width) * layout.missionDurationSeconds;
    setDragState({
      ...dragState,
      previewMetSeconds: Math.min(layout.missionDurationSeconds, Math.max(0, dragState.startMetSeconds + deltaSeconds)),
    });
  };

  const endDrag = () => {
    if (!dragState) {
      return;
    }
    const block = layout.blocks.find((item) => item.event.id === dragState.eventId);
    setDragState(null);
    if (block) {
      onScheduleEvent(block.event, dragState.previewMetSeconds);
    }
  };

  if (layout.blocks.length === 0) {
    return (
      <div className="mt-3 border border-white/10 bg-black/25 px-3 py-4 text-center font-mono text-[10px] uppercase text-zinc-600">
        Empty timeline
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden border border-white/10 bg-black/30">
      <div className="thin-scrollbar overflow-x-scroll pb-2">
        <div
          ref={trackRef}
          onPointerMove={updateDragPreview}
          onPointerUp={endDrag}
          onPointerCancel={() => setDragState(null)}
          className="relative h-52 min-w-[960px] border-b border-white/10 bg-[linear-gradient(90deg,rgba(103,232,249,0.12)_1px,transparent_1px)] bg-[length:80px_100%]"
          style={{ width: `${layout.trackWidthPercent}%` }}
        >
          <TimelineCursor positionPercent={layout.cursors.missionStart} label="Start" tone="cyan" />
          <TimelineCursor positionPercent={layout.cursors.missionEnd} label="End" tone="cyan" />
          {layout.cursors.currentSimTime !== null && <TimelineCursor positionPercent={layout.cursors.currentSimTime} label="Sim" tone="lime" />}
          {layout.cursors.selectedEvent !== null && <TimelineCursor positionPercent={layout.cursors.selectedEvent} label="Selected" tone="rose" />}
          {orbitMarkers.map((marker) => {
            const offsetSeconds = Math.round((new Date(marker.timeUtc).getTime() - new Date(mission.scenarioStart).getTime()) / 1000);
            if (offsetSeconds < 0 || offsetSeconds > layout.missionDurationSeconds) {
              return null;
            }
            const positionPercent = Math.min(100, Math.max(0, (offsetSeconds / layout.missionDurationSeconds) * 100));
            return (
              <div
                key={marker.id}
                className="pointer-events-none absolute top-0 h-full border-l border-dashed border-lime-300/45"
                style={{ left: `${positionPercent}%` }}
                title={`${marker.type.replaceAll("_", " ")} ${compactIsoUtc(marker.timeUtc)}`}
              >
                <span className="absolute top-8 -translate-x-1/2 border border-lime-300/30 bg-black/75 px-1.5 py-0.5 font-mono text-[8px] uppercase text-lime-100">
                  {marker.type.replace("PASSAGE", "").replaceAll("_", " ")}
                </span>
              </div>
            );
          })}
          {layout.blocks.map(({ event, offsetSeconds, durationSeconds, widthPercent }) => {
          const isFiniteBurn = event.type === "FINITE_BURN";
          const isImpulsiveBurn = event.type === "IMPULSIVE_BURN";
          const templateType = readStringParameter(event.parameters ?? {}, "templateType", "");
          const templateRole = readStringParameter(event.parameters ?? {}, "templateRole", "");
          const scheduleMode = eventScheduleMode(event);
          const dependencyId = readStringParameter(event.parameters ?? {}, "scheduleDependencyId", "");
          const dependencyName = dependencyId ? eventNameById.get(dependencyId) ?? dependencyId : "";
          const dependencyOffset = readNumberParameter(event.parameters ?? {}, "scheduleOffsetSeconds", 0);
          const displayOffsetSeconds = previewByEventId.get(event.id) ?? offsetSeconds;
          const displayStartPercent = Math.min(100, Math.max(0, (displayOffsetSeconds / layout.missionDurationSeconds) * 100));
          const displayExecutionTime = previewByEventId.has(event.id)
            ? new Date(new Date(mission.scenarioStart).getTime() + displayOffsetSeconds * 1000).toISOString()
            : event.executionTime;
          return (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEvent(event.id)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                  onSelectEvent(event.id);
                }
              }}
              onPointerDown={(pointerEvent) => {
                pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                onSelectEvent(event.id);
                setDragState({
                  eventId: event.id,
                  startClientX: pointerEvent.clientX,
                  startMetSeconds: offsetSeconds,
                  previewMetSeconds: offsetSeconds,
                });
              }}
              style={{
                left: `${displayStartPercent}%`,
                width: isImpulsiveBurn ? `${Math.max(2.5, Math.min(widthPercent, 5))}%` : `${Math.max(7, Math.min(widthPercent, 34))}%`,
              }}
              title={`Mission-relative position ${metOffsetLabelFromSeconds(displayOffsetSeconds)} (${formatNumber(displayStartPercent, 1)}%)`}
              className={`absolute top-14 min-h-28 min-w-[150px] cursor-grab touch-none border px-3 py-2 text-left transition active:cursor-grabbing ${
                selectedEventId === event.id
                  ? "border-cyan-300 bg-cyan-300/10"
                  : isFiniteBurn
                    ? "border-rose-300/35 bg-rose-300/[0.04] hover:border-rose-300/70"
                    : isImpulsiveBurn
                      ? "border-amber-300/45 bg-amber-300/[0.06] hover:border-amber-300/80"
                    : "border-sky-300/25 bg-sky-300/[0.03] hover:border-sky-300/60"
              } ${dragState?.eventId === event.id ? "z-20 shadow-[0_0_28px_rgba(103,232,249,0.20)]" : "z-10"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-white">{event.name}</span>
                <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                  isFiniteBurn ? "border-rose-300/45 text-rose-100" : isImpulsiveBurn ? "border-amber-300/55 text-amber-100" : "border-sky-300/35 text-sky-100"
                }`}>
                  {isFiniteBurn ? "Finite" : isImpulsiveBurn ? "Impulse" : "Coast"}
                </span>
              </span>
              {templateType && (
                <span className="mt-1 block truncate font-mono text-[9px] uppercase text-cyan-100">
                  {templateType.replaceAll("_", " ")} / {templateRole.replaceAll("_", " ")}
                </span>
              )}
              <span className="mt-2 block font-mono text-[10px] text-cyan-100">
                {displayTimelineTime(timeMode, mission, displayExecutionTime)}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-zinc-400">
                MET {metOffsetLabelFromSeconds(displayOffsetSeconds)}
              </span>
              {scheduleMode === "AFTER_EVENT" && (
                <span className="mt-1 block truncate font-mono text-[10px] text-amber-100">
                  after {dependencyName} + {metOffsetLabelFromSeconds(dependencyOffset).replace("T+", "")}
                </span>
              )}
              {isImpulsiveBurn ? (
                <span className="mt-1 block font-mono text-[10px] text-amber-100">
                  dV {formatNumber(estimatedEventDeltaVMps(event), 2)} m/s
                </span>
              ) : (
                <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                  Duration {secondsToDurationLabel(durationSeconds)}
                </span>
              )}
              {dragState?.eventId === event.id && (
                <span className="mt-1 block font-mono text-[10px] text-lime-100">
                  Preview {metOffsetLabelFromSeconds(displayOffsetSeconds)}
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 font-mono text-[10px] text-zinc-500">
        <span>{displayTimelineTime(timeMode, mission, mission.scenarioStart)}</span>
        <span>{timeMode === "MET" ? secondsToDurationLabel(missionDurationSeconds(mission)) : displayTimelineTime(timeMode, mission, mission.scenarioEnd)}</span>
      </div>
    </div>
  );
}

function TimelineCursor({
  positionPercent,
  label,
  tone,
}: {
  positionPercent: number;
  label: string;
  tone: "cyan" | "lime" | "rose";
}) {
  const color = tone === "lime" ? "border-lime-300 text-lime-100" : tone === "rose" ? "border-rose-300 text-rose-100" : "border-cyan-300 text-cyan-100";
  return (
    <div
      className={`pointer-events-none absolute top-0 h-full border-l ${color}`}
      style={{ left: `${Math.min(100, Math.max(0, positionPercent))}%` }}
    >
      <span className={`absolute top-2 -translate-x-1/2 border bg-black/75 px-1.5 py-0.5 font-mono text-[9px] uppercase ${color}`}>
        {label}
      </span>
    </div>
  );
}

function TimelineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/25 px-2 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function TargetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-300/60">{label}</span>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[11px] text-cyan-100 outline-none transition focus:border-cyan-300"
      />
    </label>
  );
}

function exportMissionReport({
  mission,
  events,
  orbitSummary,
  propagationProfile,
  trajectoryOverlay,
  missionValidation,
  missionTargets,
  missionConstraints,
  monteCarloSettings,
  relativeMotionSettings,
  groundStation,
  coverageSettings,
  constellationConfig,
}: {
  mission: BackendMission;
  events: BackendMissionTimelineEvent[];
  orbitSummary: OrbitSummary;
  propagationProfile: BackendPropagationProfile | null;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  missionValidation: ReturnType<typeof validateMissionPlan>;
  missionTargets: MissionDesignTargets;
  missionConstraints: MissionConstraints;
  monteCarloSettings: MonteCarloSettings;
  relativeMotionSettings: RelativeMotionSettings;
  groundStation: GroundStationConfig;
  coverageSettings: CoverageSettings;
  constellationConfig: WalkerConstellationConfig;
}) {
  const report = buildMissionReport({
    mission,
    events,
    orbitSummary,
    profile: propagationProfile,
    trajectoryOverlay,
    validation: missionValidation,
    targets: missionTargets,
    constraints: missionConstraints,
    monteCarloSettings,
    relativeMotionSettings,
    groundStation,
    coverageSettings,
    constellation: constellationConfig,
  });
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${mission.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-mission-report.json`;
  link.click();
  URL.revokeObjectURL(url);
}

type TemplateEventGroup = {
  templateInstanceId: string;
  templateType: string;
  generatedAt: string;
  events: BackendMissionTimelineEvent[];
  totalDeltaVMps: number;
  coastSeconds: number;
};

function templateEventGroups(events: BackendMissionTimelineEvent[]) {
  const groups = new Map<string, TemplateEventGroup>();
  events.forEach((event) => {
    const parameters = event.parameters ?? {};
    const generated = parameters.generated === true;
    const templateInstanceId = readStringParameter(parameters, "templateInstanceId", "");
    if (!generated || !templateInstanceId) {
      return;
    }
    const current = groups.get(templateInstanceId) ?? {
      templateInstanceId,
      templateType: readStringParameter(parameters, "templateType", "Generated"),
      generatedAt: readStringParameter(parameters, "generatedAt", event.createdAt),
      events: [],
      totalDeltaVMps: 0,
      coastSeconds: 0,
    };
    current.events.push(event);
    current.totalDeltaVMps += estimatedEventDeltaVMps(event);
    if (event.type === "COAST") {
      current.coastSeconds += readNumberParameter(parameters, "transferTimeSeconds", readNumberParameter(parameters, "coastSeconds", 0));
    }
    groups.set(templateInstanceId, current);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    events: group.events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex),
  })).toSorted((a, b) => (a.events[0]?.sequenceIndex ?? 0) - (b.events[0]?.sequenceIndex ?? 0));
}

function TemplateGroupSummary({ group }: { group: TemplateEventGroup }) {
  return (
    <div className="border border-cyan-300/15 bg-black/25 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{group.templateType.replaceAll("_", " ")}</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">{group.templateInstanceId}</p>
        </div>
        <span className="border border-cyan-300/30 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-100">
          Generated
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <DetailMetric label="Events" value={String(group.events.length)} />
        <DetailMetric label="Burns" value={String(group.events.filter((event) => event.type !== "COAST").length)} />
        <DetailMetric label="Delta-V" value={`${formatNumber(group.totalDeltaVMps, 2)} m/s`} />
        <DetailMetric label="Coast" value={group.coastSeconds > 0 ? secondsToDurationLabel(group.coastSeconds) : "None"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.events.map((event) => (
          <span key={event.id} className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300">
            {readStringParameter(event.parameters ?? {}, "templateRole", event.type)}
          </span>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-zinc-600">Generated {compactIsoUtc(group.generatedAt)}</p>
    </div>
  );
}

function TimelineEventCard({
  event,
  index,
  selected,
  dragging,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  event: BackendMissionTimelineEvent;
  index: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const parameters = event.parameters ?? {};
  const isFiniteBurn = event.type === "FINITE_BURN";
  const isImpulsiveBurn = event.type === "IMPULSIVE_BURN";
  const templateType = readStringParameter(parameters, "templateType", "");
  const templateRole = readStringParameter(parameters, "templateRole", "");
  const templateInstanceId = readStringParameter(parameters, "templateInstanceId", "");
  const generatedAt = readStringParameter(parameters, "generatedAt", event.createdAt);
  const executionStrategy = readStringParameter(parameters, "executionStrategy", "");
  const estimatedPropellantKg = readNumberParameter(parameters, "estimatedPropellantKg", 0);
  const quality = isFiniteBurn || isImpulsiveBurn ? maneuverQualityAnalysis(event) : null;
  const summary = isFiniteBurn
    ? `${readNumberParameter(parameters, "durationSeconds", 0)}s, ${readNumberParameter(parameters, "thrustNewton", 0)} N, ${readStringParameter(parameters, "directionFrame", "TNW")}`
    : isImpulsiveBurn
      ? `${formatNumber(estimatedEventDeltaVMps(event), 2)} m/s, ${readStringParameter(parameters, "directionFrame", "TNW")}, ISP ${readNumberParameter(parameters, "ispSeconds", 0)}s`
    : "Coast segment";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(dragEvent) => dragEvent.preventDefault()}
      onDrop={onDrop}
      className={`border bg-black/30 p-3 transition ${
        selected ? "border-cyan-300/70" : "border-white/10 hover:border-cyan-300/45"
      } ${dragging ? "opacity-50" : "opacity-100"}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">[{index + 1}] {event.name}</span>
            <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{formatUtc(new Date(event.executionTime))}</span>
          </span>
          <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${
            isFiniteBurn ? "border-rose-300/45 text-rose-100" : isImpulsiveBurn ? "border-amber-300/55 text-amber-100" : "border-sky-300/35 text-sky-100"
          }`}>
            {isFiniteBurn ? "Finite" : isImpulsiveBurn ? "Impulse" : "Coast"}
          </span>
        </span>
        <span className="mt-2 block truncate text-xs text-zinc-400">{summary}</span>
        {templateType && (
          <span className="mt-2 grid gap-2 border border-cyan-300/10 bg-cyan-300/[0.03] p-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="border border-cyan-300/30 px-2 py-0.5 font-mono text-[9px] uppercase text-cyan-100">
                {templateType.replaceAll("_", " ")}
              </span>
              <span className="border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase text-zinc-300">
                {templateRole.replaceAll("_", " ")}
              </span>
              {executionStrategy && (
                <span className="border border-amber-300/25 px-2 py-0.5 font-mono text-[9px] uppercase text-amber-100">
                  {executionStrategy.replaceAll("_", " ")}
                </span>
              )}
            </span>
            <span className="grid gap-1 font-mono text-[10px] text-zinc-500 md:grid-cols-2">
              <span className="truncate">Instance {templateInstanceId}</span>
              <span>Generated {compactIsoUtc(generatedAt)}</span>
              <span>dV {formatNumber(estimatedEventDeltaVMps(event), 2)} m/s</span>
              <span>Prop {estimatedPropellantKg > 0 ? `${formatNumber(estimatedPropellantKg, 3)} kg` : "n/a"}</span>
            </span>
          </span>
        )}
        {quality && (
          <span className="mt-2 grid gap-1 border border-lime-300/10 bg-lime-300/[0.03] p-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-lime-200">Execution Quality</span>
            <span className="grid gap-1 font-mono text-[10px] text-zinc-500 md:grid-cols-3">
              <span>Location {quality.location}</span>
              <span>Efficiency {quality.efficiency}</span>
              <span>Alignment {quality.alignment}</span>
            </span>
            <span className="text-[11px] leading-5 text-zinc-400">{quality.rationale}</span>
          </span>
        )}
      </button>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${
            event.enabled ? "border-lime-300/50 text-lime-100 hover:bg-lime-300/10" : "border-white/10 text-zinc-500 hover:border-zinc-300"
          }`}
        >
          {event.enabled ? "On" : "Off"}
        </button>
        <button type="button" onClick={onEdit} className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-rose-300 hover:text-rose-100">
          Del
        </button>
      </div>
    </div>
  );
}
