import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BackendCapabilityRegistry, BackendMission, BackendMissionTimelineEvent, BackendPropagationProfile, UpdatePropagationProfileRequest } from "@/services/orbitServerApi";
import { formatNumber, formatUtc } from "@/geometry/format";
import { PropagationProfileEditor } from "./PropagationProfileEditor";
import { OrbitSummaryPanel } from "./OrbitSummaryPanel";
import type { OrbitSummary } from "./OrbitSummaryPanel";
import { DetailMetric, HudPanel } from "./ui";
import type { MissionGenerationSnapshot, MissionTrajectoryOverlay, TimelineLayoutModel, TimelineSnapMode, TimelineTimeMode, TimelineZoomPreset, TimelineInteractionModel } from "./types";
import { buildMissionReport, buildTimelineLayoutModel, capabilityMatrix, compactIsoUtc, deltaVBreakdown, detectOrbitEventMarkers, displayTimelineTime, engineeringCapabilityFindings, estimatedEventDeltaVMps, eventScheduleMode, forceModelSummary, integratorSummary, maneuverQualityAnalysis, metOffsetLabelFromSeconds, missionAnalysisFindings, missionConstraintViolations, missionDurationSeconds, missionObjectiveProgress, missionTargetingSolutions, missionTimelineAnalytics, missionTrajectoryMaxStepSeconds, missionTrajectoryMinStepSeconds, monteCarloDispersion, optimizationCandidates, orbitLifetimeEstimate, orekitEventDetectorCapabilityMatrix, readNumberParameter, readStringParameter, secondsToDurationLabel, solveTargetingProblem, spacecraftPerformanceStatus, timelineAnalysis, timelineSnapOptions, timelineZoomOptions, tradeStudySolutions, validateMissionPlan } from "./utils";
import type { CoverageSettings, GroundStationConfig, MissionConstraints, MissionDesignTargets, MonteCarloSettings, MissionOrbitEventMarker, RelativeMotionSettings, WalkerConstellationConfig } from "./utils";

type AnalysisWorkspaceTab = "TRAJECTORY" | "HEALTH" | "OPTIMIZATION" | "OPERATIONS" | "AUDIT";
type MissionPlannerPhase = "DEFINITION" | "CURRENT_ORBIT" | "TARGET_ORBIT" | "STRATEGY" | "VALIDATION" | "ANALYSIS" | "REPORTS";
type MissionExecutionMode = "PROPAGATION_ONLY" | "COAST_MISSION" | "MANEUVER_MISSION";

const analysisWorkspaceTabs: Array<{ id: AnalysisWorkspaceTab; label: string }> = [
  { id: "TRAJECTORY", label: "Trajectory Review" },
  { id: "HEALTH", label: "Flight Dynamics" },
  { id: "OPTIMIZATION", label: "Optimization" },
  { id: "OPERATIONS", label: "Operations" },
  { id: "AUDIT", label: "Engineering Audit" },
];

const missionPlannerPhases: Array<{ id: MissionPlannerPhase; label: string; helper: string }> = [
  { id: "DEFINITION", label: "Mission Definition", helper: "Define problem" },
  { id: "CURRENT_ORBIT", label: "Current Orbit", helper: "Inspect start" },
  { id: "TARGET_ORBIT", label: "Target Orbit", helper: "Define change" },
  { id: "STRATEGY", label: "Strategy", helper: "Maneuver plan" },
  { id: "VALIDATION", label: "Validation", helper: "Pre-flight review" },
];

const missionPlannerPhaseOrder = missionPlannerPhases.map((phase) => phase.id);

const missionExecutionModes: Array<{ id: MissionExecutionMode; label: string; helper: string }> = [
  { id: "PROPAGATION_ONLY", label: "Propagation Only", helper: "Propagate the current orbit without timeline events." },
  { id: "COAST_MISSION", label: "Coast Mission", helper: "Use scheduled coast segments without burns." },
  { id: "MANEUVER_MISSION", label: "Maneuver Mission", helper: "Execute enabled coast and burn timeline events." },
];

function deriveExecutionMode(events: BackendMissionTimelineEvent[]): MissionExecutionMode {
  const enabledEvents = events.filter((event) => event.enabled);
  if (enabledEvents.some((event) => event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN")) {
    return "MANEUVER_MISSION";
  }
  if (enabledEvents.some((event) => event.type === "COAST")) {
    return "COAST_MISSION";
  }
  return "PROPAGATION_ONLY";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function flattenSnapshot(value: unknown, prefix = "", output: Record<string, string> = {}) {
  if (value === null || typeof value !== "object") {
    output[prefix || "value"] = stableStringify(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenSnapshot(item, `${prefix}[${index}]`, output));
    return output;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
    flattenSnapshot(entryValue, prefix ? `${prefix}.${key}` : key, output);
  });
  return output;
}

function diffSnapshotFields(current: MissionGenerationSnapshot | null, generated: MissionGenerationSnapshot | null) {
  if (!current || !generated) {
    return [];
  }
  const currentFlat = flattenSnapshot(current);
  const generatedFlat = flattenSnapshot(generated);
  const keys = [...new Set([...Object.keys(currentFlat), ...Object.keys(generatedFlat)])].sort();
  return keys
    .filter((key) => currentFlat[key] !== generatedFlat[key])
    .map((key) => ({
      field: key,
      current: currentFlat[key] ?? "<missing>",
      generated: generatedFlat[key] ?? "<missing>",
    }));
}

function profileGenerationSnapshot(profile: BackendPropagationProfile | null): MissionGenerationSnapshot["executionProfile"] {
  if (!profile) {
    return null;
  }
  return {
    id: profile.id,
    ownerType: profile.ownerType,
    ownerId: profile.ownerId,
    name: profile.name,
    preset: profile.preset,
    propagatorType: profile.propagatorType,
    gravityEnabled: profile.gravityEnabled,
    gravityDegree: profile.gravityDegree,
    gravityOrder: profile.gravityOrder,
    dragEnabled: profile.dragEnabled,
    solarRadiationPressureEnabled: profile.solarRadiationPressureEnabled,
    thirdBodySunEnabled: profile.thirdBodySunEnabled,
    thirdBodyMoonEnabled: profile.thirdBodyMoonEnabled,
    maneuverModelEnabled: profile.maneuverModelEnabled,
    dryMassKg: profile.dryMassKg,
    fuelMassKg: profile.fuelMassKg,
    dragAreaM2: profile.dragAreaM2,
    dragCoefficient: profile.dragCoefficient,
    srpAreaM2: profile.srpAreaM2,
    reflectivityCoefficient: profile.reflectivityCoefficient,
    nominalThrustN: profile.nominalThrustN,
    nominalIspS: profile.nominalIspS,
    notes: profile.notes,
    integratorType: profile.integratorType,
    integratorMinStep: profile.integratorMinStep,
    integratorMaxStep: profile.integratorMaxStep,
    integratorAbsTol: profile.integratorAbsTol,
    integratorRelTol: profile.integratorRelTol,
  };
}

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
  onGenerateTrajectory: (generationSnapshot?: MissionGenerationSnapshot) => void;
  onTrajectoryCadenceChange: (value: string) => void;
  onStagePropagationProfile: (request: UpdatePropagationProfileRequest) => void;
  onDragEvent: (eventId: string | null) => void;
  onDropEvent: (sourceEventId: string, targetEventId: string) => void;
  onScheduleEvent: (event: BackendMissionTimelineEvent, targetMetSeconds: number, snapMode: TimelineSnapMode) => void;
}) {
  const generatedMissionDesign = trajectoryOverlay?.generationSnapshot ?? null;
  const [timeMode, setTimeMode] = useState<TimelineTimeMode>("UTC");
  const [zoomPreset, setZoomPreset] = useState<TimelineZoomPreset>("THREE_HOURS");
  const [customZoomHours, setCustomZoomHours] = useState("3");
  const [snapMode, setSnapMode] = useState<TimelineSnapMode>("FIVE_MIN");
  const [plannerPhase, setPlannerPhase] = useState<MissionPlannerPhase>("DEFINITION");
  const [furthestPlannerPhaseIndex, setFurthestPlannerPhaseIndex] = useState(0);
  const [analysisTab, setAnalysisTab] = useState<AnalysisWorkspaceTab>("TRAJECTORY");
  const [objectiveType, setObjectiveType] = useState(generatedMissionDesign?.objectiveType ?? "REACH_TARGET_ALTITUDE");
  const [advancedObjectiveOpen, setAdvancedObjectiveOpen] = useState(false);
  const [strategyAdvancedOpen, setStrategyAdvancedOpen] = useState(true);
  const [targetTrueAnomalyDeg, setTargetTrueAnomalyDeg] = useState<number | null>(
    typeof generatedMissionDesign?.targetOrbit.targetTrueAnomalyDeg === "number" ? generatedMissionDesign.targetOrbit.targetTrueAnomalyDeg : null,
  );
  const [missionTargets, setMissionTargets] = useState<MissionDesignTargets>({
    targetAltitudeKm: typeof generatedMissionDesign?.targetOrbit.targetAltitudeKm === "number" ? generatedMissionDesign.targetOrbit.targetAltitudeKm : 550,
    targetInclinationDeg: typeof generatedMissionDesign?.targetOrbit.targetInclinationDeg === "number" ? generatedMissionDesign.targetOrbit.targetInclinationDeg : null,
    targetEccentricity: typeof generatedMissionDesign?.targetOrbit.targetEccentricity === "number" ? generatedMissionDesign.targetOrbit.targetEccentricity : 0,
    targetRaanDeg: typeof generatedMissionDesign?.targetOrbit.targetRaanDeg === "number" ? generatedMissionDesign.targetOrbit.targetRaanDeg : null,
    targetArgumentOfPerigeeDeg: typeof generatedMissionDesign?.targetOrbit.targetArgumentOfPerigeeDeg === "number" ? generatedMissionDesign.targetOrbit.targetArgumentOfPerigeeDeg : null,
  });
  const [monteCarloSettings, setMonteCarloSettings] = useState<MonteCarloSettings>({
    samples: 100,
    burnMagnitudeErrorPercent: 1,
    burnDirectionErrorDeg: 0.25,
    timingErrorSeconds: 10,
  });
  const [missionConstraints, setMissionConstraints] = useState<MissionConstraints>({
    maxBurnDurationSeconds: typeof generatedMissionDesign?.missionConstraints.maxBurnDurationSeconds === "number" ? generatedMissionDesign.missionConstraints.maxBurnDurationSeconds : 600,
    maxSingleBurnDeltaVMps: typeof generatedMissionDesign?.missionConstraints.maxSingleBurnDeltaVMps === "number" ? generatedMissionDesign.missionConstraints.maxSingleBurnDeltaVMps : 250,
    fuelReservePercent: typeof generatedMissionDesign?.missionConstraints.fuelReservePercent === "number" ? generatedMissionDesign.missionConstraints.fuelReservePercent : 10,
    minPerigeeAltitudeKm: typeof generatedMissionDesign?.missionConstraints.minPerigeeAltitudeKm === "number" ? generatedMissionDesign.missionConstraints.minPerigeeAltitudeKm : 160,
    maxEclipseDurationSeconds: typeof generatedMissionDesign?.missionConstraints.maxEclipseDurationSeconds === "number" ? generatedMissionDesign.missionConstraints.maxEclipseDurationSeconds : 2400,
  });
  const [relativeMotionSettings] = useState<RelativeMotionSettings>({
    radialOffsetKm: 0.2,
    alongTrackOffsetKm: 5,
    crossTrackOffsetKm: 0.1,
    relativeDriftMps: -0.05,
  });
  const [groundStation] = useState<GroundStationConfig>({
    latitudeDeg: 13.73,
    longitudeDeg: 80.23,
    elevationMaskDeg: 10,
  });
  const [coverageSettings] = useState<CoverageSettings>({
    swathWidthKm: 120,
    minimumElevationDeg: 10,
  });
  const [constellationConfig] = useState<WalkerConstellationConfig>({
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
  const executionMode = useMemo(() => deriveExecutionMode(events), [events]);
  const missionAnalytics = useMemo(() => missionTimelineAnalytics(mission, events, propagationProfile), [events, mission, propagationProfile]);
  const backendEventDetectionActive = false;
  const orbitEventMarkers = useMemo(
    () => backendEventDetectionActive ? detectOrbitEventMarkers(trajectoryOverlay?.mission?.trajectory) : [],
    [backendEventDetectionActive, trajectoryOverlay],
  );
  const dvBreakdown = useMemo(() => deltaVBreakdown(events), [events]);
  const targetingSolutions = useMemo(() => missionTargetingSolutions(orbitSummary, missionTargets, propagationProfile), [missionTargets, orbitSummary, propagationProfile]);
  const objectiveProgress = useMemo(() => missionObjectiveProgress(orbitSummary, missionTargets), [missionTargets, orbitSummary]);
  const dispersion = useMemo(() => monteCarloDispersion(missionAnalytics, monteCarloSettings), [missionAnalytics, monteCarloSettings]);
  const constraintViolations = useMemo(() => missionConstraintViolations(events, missionAnalytics, orbitSummary, orbitEventMarkers, missionConstraints), [events, missionAnalytics, missionConstraints, orbitEventMarkers, orbitSummary]);
  const lifetimeEstimate = useMemo(() => orbitLifetimeEstimate(orbitSummary), [orbitSummary]);
  const tradeStudy = useMemo(() => tradeStudySolutions(targetingSolutions, missionAnalytics), [missionAnalytics, targetingSolutions]);
  const targetSolver = useMemo(() => solveTargetingProblem(orbitSummary, missionTargets, propagationProfile), [missionTargets, orbitSummary, propagationProfile]);
  const maneuverOptimization = useMemo(() => optimizationCandidates(targetSolver, missionAnalytics), [missionAnalytics, targetSolver]);
  const templateGroups = useMemo(() => templateEventGroups(events), [events]);
  const missionValidation = useMemo(() => validateMissionPlan(mission, events, propagationProfile), [events, mission, propagationProfile]);
  const performanceStatus = spacecraftPerformanceStatus(missionAnalytics.fuelBudget);
  const hasGeneratedTrajectory = Boolean(trajectoryOverlay);
  const targetAltitudeLabel = missionTargets.targetAltitudeKm == null ? "Unspecified" : `${formatNumber(missionTargets.targetAltitudeKm, 2)} km`;
  const targetInclinationLabel = missionTargets.targetInclinationDeg == null ? "Maintain current" : `${formatNumber(missionTargets.targetInclinationDeg, 3)} deg`;
  const targetEccentricityLabel = missionTargets.targetEccentricity == null ? "Maintain current" : formatNumber(missionTargets.targetEccentricity, 5);
  const targetRaanLabel = missionTargets.targetRaanDeg == null ? "Maintain current" : `${formatNumber(missionTargets.targetRaanDeg, 3)} deg`;
  const targetArgumentOfPerigeeLabel = missionTargets.targetArgumentOfPerigeeDeg == null ? "Maintain current" : `${formatNumber(missionTargets.targetArgumentOfPerigeeDeg, 3)} deg`;
  const targetTrueAnomalyLabel = targetTrueAnomalyDeg == null ? "Mission dependent" : `${formatNumber(targetTrueAnomalyDeg, 3)} deg`;
  const snapshotCadenceSeconds = trajectoryCadenceError ? null : Math.trunc(Number(trajectoryCadenceInput));
  const missionDesignSnapshot = useMemo<MissionGenerationSnapshot | null>(() => {
    if (!mission) {
      return null;
    }
    return {
      mission: {
        id: mission.id,
        scenarioStart: mission.scenarioStart,
        scenarioEnd: mission.scenarioEnd,
        propagatorType: mission.propagatorType,
      },
      executionProfile: profileGenerationSnapshot(propagationProfile),
      sampleCadenceSeconds: Number.isFinite(snapshotCadenceSeconds ?? Number.NaN) ? snapshotCadenceSeconds : null,
      events: events
        .toSorted((a, b) => a.sequenceIndex - b.sequenceIndex)
        .map((event) => ({
          id: event.id,
          type: event.type,
          sequenceIndex: event.sequenceIndex,
          enabled: event.enabled,
          executionTime: event.executionTime,
          parameters: event.parameters,
        })),
      currentOrbit: {
        subjectNoradId: mission.subjectNoradId,
        subjectOrbitId: mission.subjectOrbitId,
        orbitType: orbitSummary.orbitType,
      },
      targetOrbit: {
        targetAltitudeKm: missionTargets.targetAltitudeKm,
        targetInclinationDeg: missionTargets.targetInclinationDeg,
        targetEccentricity: missionTargets.targetEccentricity,
        targetRaanDeg: missionTargets.targetRaanDeg,
        targetArgumentOfPerigeeDeg: missionTargets.targetArgumentOfPerigeeDeg,
        targetTrueAnomalyDeg,
      },
      objectiveType,
      executionMode,
      missionConstraints,
    };
  }, [events, executionMode, mission, missionConstraints, missionTargets, objectiveType, orbitSummary.orbitType, propagationProfile, snapshotCadenceSeconds, targetTrueAnomalyDeg]);
  const missionDesignRunSignature = missionDesignSnapshot ? stableStringify(missionDesignSnapshot) : "";
  const generatedDesignSignature = trajectoryOverlay?.generationSnapshot
    ? stableStringify(trajectoryOverlay.generationSnapshot)
    : trajectoryOverlay?.designSignature ?? null;
  const designSignatureMismatch = Boolean(generatedDesignSignature && missionDesignRunSignature && generatedDesignSignature !== missionDesignRunSignature);
  const effectiveTrajectoryStale = Boolean(
    trajectoryOverlay
      && (generatedDesignSignature ? designSignatureMismatch : trajectoryStale || trajectoryOverlay.stale),
  );
  const trajectoryStatus = !trajectoryOverlay ? "Not Generated" : effectiveTrajectoryStale ? "Out of Date" : "Generated";
  const staleDebugKeyRef = useRef("");
  useEffect(() => {
    if (!effectiveTrajectoryStale || !trajectoryOverlay || !missionDesignSnapshot) {
      return;
    }
    const generatedSnapshot = trajectoryOverlay.generationSnapshot ?? null;
    const debugKey = `${missionDesignRunSignature}::${generatedDesignSignature ?? ""}::${trajectoryOverlay.stale}::${trajectoryStale}`;
    if (staleDebugKeyRef.current === debugKey) {
      return;
    }
    staleDebugKeyRef.current = debugKey;
    console.debug("[Mission Planner] trajectory stale debug", {
      currentDesignSignature: missionDesignRunSignature,
      generationSnapshotSignature: generatedDesignSignature,
      overlayStaleFlag: trajectoryOverlay.stale,
      parentTrajectoryStale: trajectoryStale,
      diffFields: diffSnapshotFields(missionDesignSnapshot, generatedSnapshot),
    });
  }, [effectiveTrajectoryStale, generatedDesignSignature, missionDesignRunSignature, missionDesignSnapshot, trajectoryOverlay, trajectoryStale]);
  const altitudeDeltaKm = orbitSummary.currentAltitudeKm != null && missionTargets.targetAltitudeKm != null
    ? missionTargets.targetAltitudeKm - orbitSummary.currentAltitudeKm
    : null;
  const inclinationDeltaDeg = orbitSummary.inclinationDeg != null && missionTargets.targetInclinationDeg != null
    ? missionTargets.targetInclinationDeg - orbitSummary.inclinationDeg
    : null;
  const missionDeltaType = objectiveType === "DEORBIT"
    ? "Deorbit"
    : altitudeDeltaKm == null || Math.abs(altitudeDeltaKm) < 1
      ? inclinationDeltaDeg != null && Math.abs(inclinationDeltaDeg) >= 0.01 ? "Plane Change" : "Orbit Maintenance"
      : altitudeDeltaKm > 0 ? "Orbit Raising" : "Orbit Lowering";
  const hasEnabledBurnEvents = events.some((event) => event.enabled && (event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN"));
  const missionDurationValid = mission ? missionDurationSeconds(mission) > 0 : false;
  const executionModeBlocker = !mission
    ? "Create a mission before validation."
    : !missionDurationValid
      ? "Mission duration must be greater than zero."
      : !propagationProfile
        ? "Mission execution profile is still loading. Configure propagation before validation."
        : propagationProfile.propagatorType !== "NUMERICAL" && hasEnabledBurnEvents
          ? `${propagationProfile.propagatorType.replaceAll("_", " ")} propagation cannot execute burn events. Select Numerical propagation or disable burn events.`
          : propagationProfile.maneuverModelEnabled === false && hasEnabledBurnEvents
            ? "Burn events exist, but the mission propagation profile has maneuver execution disabled."
            : null;
  const executionModeWarnings = useMemo(() => [] as string[], []);
  const combinedValidationWarnings = useMemo(
    () => [...new Set([...missionValidation.warnings, ...executionModeWarnings])],
    [executionModeWarnings, missionValidation.warnings],
  );
  const missionValidationReview = useMemo(() => ({
    errors: executionModeBlocker ? [...new Set([...missionValidation.errors, executionModeBlocker])] : missionValidation.errors,
    warnings: combinedValidationWarnings,
  }), [combinedValidationWarnings, executionModeBlocker, missionValidation.errors]);
  const missionFindings = useMemo(() => missionAnalysisFindings({
    events,
    orbitSummary,
    profile: propagationProfile,
    validation: missionValidationReview,
    constraintViolations,
    trajectoryStale: effectiveTrajectoryStale,
    targetSolver,
  }), [constraintViolations, effectiveTrajectoryStale, events, missionValidationReview, orbitSummary, propagationProfile, targetSolver]);
  const actionableMissionFindings = useMemo(
    () => missionFindings.filter((finding) => finding.severity !== "INFO"),
    [missionFindings],
  );
  const capabilityFindings = useMemo(() => engineeringCapabilityFindings(), []);
  const eventDetectorCapabilities = useMemo(() => orekitEventDetectorCapabilityMatrix(), []);
  const backendCapabilityMatrix = useMemo(() => capabilityMatrix(), []);
  const validationStatus = missionValidationReview.errors.length > 0 ? "Blocked" : missionValidationReview.warnings.length > 0 ? "Review" : "Ready";
  const currentPlannerPhaseIndex = missionPlannerPhaseOrder.indexOf(plannerPhase);
  const effectiveFurthestPlannerPhaseIndex = hasGeneratedTrajectory
    ? missionPlannerPhaseOrder.length - 1
    : Math.min(furthestPlannerPhaseIndex, missionPlannerPhaseOrder.indexOf("VALIDATION"));
  const previousPlannerPhase = currentPlannerPhaseIndex > 0 ? missionPlannerPhaseOrder[currentPlannerPhaseIndex - 1] : null;
  const nextPlannerPhase = currentPlannerPhaseIndex >= 0 && currentPlannerPhaseIndex < missionPlannerPhaseOrder.length - 1
    ? missionPlannerPhaseOrder[currentPlannerPhaseIndex + 1]
    : null;
  const strategyStepReady = !executionModeBlocker;
  const nextStepBlocker = plannerPhase === "STRATEGY" && !strategyStepReady
    ? executionModeBlocker
    : null;
  const goToPlannerPhase = (phase: MissionPlannerPhase) => {
    const index = missionPlannerPhaseOrder.indexOf(phase);
    if (index < 0 || index > effectiveFurthestPlannerPhaseIndex) {
      return;
    }
    if (phase === "VALIDATION" && !strategyStepReady) {
      return;
    }
    setPlannerPhase(phase);
  };
  const advancePlannerPhase = () => {
    if (!nextPlannerPhase || nextStepBlocker) {
      return;
    }
    const nextIndex = missionPlannerPhaseOrder.indexOf(nextPlannerPhase);
    setFurthestPlannerPhaseIndex((current) => Math.max(current, nextIndex));
    setPlannerPhase(nextPlannerPhase);
  };
  const trajectoryCurrentBlocker = trajectoryOverlay && !effectiveTrajectoryStale
    ? "Trajectory is current. Change mission configuration, timeline, or cadence to update."
    : null;
  const trajectoryGenerationBlocker = !propagationProfile
    ? "Mission propagation profile is still loading. Configure propagation before generating trajectory."
    : executionModeBlocker
      ? executionModeBlocker
      : propagationProfile.propagatorType !== "NUMERICAL" && hasEnabledBurnEvents
      ? `${propagationProfile.propagatorType.replaceAll("_", " ")} propagation cannot execute maneuver mission events. Select Numerical or disable burn events.`
      : missionValidation.errors[0] ?? trajectoryCadenceError ?? trajectoryCurrentBlocker;
  const generateActionBlocker = hasGeneratedTrajectory && !effectiveTrajectoryStale ? null : trajectoryGenerationBlocker;
  const layoutModel = useMemo(() => mission
    ? buildTimelineLayoutModel(mission, events, interactionModel, selectedEventId, simulationTimeIso)
    : null, [events, interactionModel, mission, selectedEventId, simulationTimeIso]);
  const updateTarget = (key: keyof MissionDesignTargets, value: string) => {
    const parsed = Number(value);
    setMissionTargets((current) => ({ ...current, [key]: value.trim() === "" || !Number.isFinite(parsed) ? null : parsed }));
  };
  const updateTargetTrueAnomaly = (value: string) => {
    const parsed = Number(value);
    setTargetTrueAnomalyDeg(value.trim() === "" || !Number.isFinite(parsed) ? null : parsed);
  };
  const updateMonteCarlo = (key: keyof MonteCarloSettings, value: string) => {
    const parsed = Number(value);
    setMonteCarloSettings((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const updateConstraint = (key: keyof MissionConstraints, value: string) => {
    const parsed = Number(value);
    setMissionConstraints((current) => ({ ...current, [key]: value.trim() === "" || !Number.isFinite(parsed) ? null : parsed }));
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
        ) : plannerPhase === "STRATEGY" ? (
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
        ) : null}
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
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">Orbit Operations Mode</p>
                <p className="mt-1 text-emerald-100/85">No mission has been created. Mission analysis becomes available after a trajectory is generated.</p>
              </div>
              <div className="grid gap-2 border border-emerald-300/15 bg-black/20 p-2 text-[11px]">
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Selected Orbit</span>
                  <span className="text-right">{subjectSummary.label}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Available</span>
                  <span className="text-right">Orbit visualization, ground track, range analysis</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Unavailable</span>
                  <span className="text-right">Mission analysis, reports, optimization</span>
                </div>
              </div>
              <div className="grid gap-2">
                <button type="button" onClick={onInitializeMission} className="border border-emerald-300/50 px-3 py-2 font-mono text-[10px] uppercase text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10">
                  Create Mission
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
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Definition</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                {hasGeneratedTrajectory ? "Trajectory products are available; mission design context remains below." : "Define the mission problem before selecting objectives or maneuvers."}
              </p>
            </div>
            {hasGeneratedTrajectory && (
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                validationStatus === "Blocked"
                  ? "border-rose-300/40 text-rose-100"
                  : validationStatus === "Review"
                    ? "border-amber-300/40 text-amber-100"
                    : "border-lime-300/40 text-lime-100"
              }`}>
                {validationStatus}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <DetailMetric label="Mission Name" value={mission.name} />
            <DetailMetric label="Mission Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
            <DetailMetric label="Spacecraft" value={subjectSummary.label} />
            <DetailMetric label="Start Epoch" value={compactIsoUtc(mission.scenarioStart)} />
            <DetailMetric label="Selected Orbit" value={subjectSummary.detail} />
            {hasGeneratedTrajectory && (
              <>
                <DetailMetric label="Mission Status" value={validationStatus} />
                <DetailMetric label="Last Modified" value={mission.updatedAt ? compactIsoUtc(mission.updatedAt) : "Unknown"} />
                <DetailMetric label="Event Count" value={String(analysis.eventCount)} />
                <DetailMetric label="Trajectory Status" value={trajectoryStatus} />
              </>
            )}
          </div>
          {hasGeneratedTrajectory && (
            <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 border px-3 py-2 ${
              effectiveTrajectoryStale ? "border-amber-300/30 bg-amber-300/[0.05]" : "border-lime-300/20 bg-lime-300/[0.04]"
            }`}>
              <div>
                <p className={`font-mono text-[10px] uppercase ${effectiveTrajectoryStale ? "text-amber-200" : "text-lime-200"}`}>
                  {effectiveTrajectoryStale ? "Trajectory Out Of Date" : "Analysis Available"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {effectiveTrajectoryStale
                    ? "Mission configuration changed after trajectory generation. Regenerate before using results for review."
                    : "Trajectory products are ready for engineering review."}
                </p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${effectiveTrajectoryStale ? "border-amber-300/40 text-amber-100" : "border-lime-300/40 text-lime-100"}`}>
                {trajectoryStatus}
              </span>
            </div>
          )}
        </div>
      )}

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">Mission Design</p>
          <div className="grid gap-1 md:grid-cols-5">
            {missionPlannerPhases.map((step) => {
              const stepIndex = missionPlannerPhaseOrder.indexOf(step.id);
              const locked = stepIndex > effectiveFurthestPlannerPhaseIndex;
              const completed = hasGeneratedTrajectory && (plannerPhase === "ANALYSIS" || plannerPhase === "REPORTS")
                ? true
                : stepIndex < currentPlannerPhaseIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (!locked) {
                      goToPlannerPhase(step.id);
                    }
                  }}
                  disabled={locked}
                  title={locked ? "Complete the previous mission-design step first." : step.helper}
                  className={`border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    plannerPhase === step.id
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : completed
                        ? "border-lime-300/35 bg-lime-300/[0.04] text-lime-100 hover:border-lime-300/60"
                      : "border-white/10 text-cyan-100 hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  }`}
                >
                  <span className="mb-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full border ${
                      plannerPhase === step.id
                        ? "border-slate-950 bg-slate-950"
                        : completed
                          ? "border-lime-300 bg-lime-300"
                          : locked
                            ? "border-zinc-700 bg-transparent"
                            : "border-cyan-300 bg-transparent"
                    }`} />
                    {stepIndex < missionPlannerPhases.length - 1 && (
                      <span className={`h-px flex-1 ${completed ? "bg-lime-300/55" : "bg-white/10"}`} />
                    )}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.08em]">{step.label}</span>
                  <span className={`mt-1 block text-[10px] ${plannerPhase === step.id ? "text-slate-800" : completed ? "text-lime-200/70" : "text-zinc-500"}`}>{locked ? "Future step" : completed ? "Completed" : step.helper}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mission && hasGeneratedTrajectory && (
        <div className="mt-3 border border-lime-300/20 bg-lime-300/[0.035] p-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-200">Mission Results</p>
              <p className="mt-1 text-[11px] text-zinc-500">Post-generation analysis products and exportable mission products.</p>
            </div>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${effectiveTrajectoryStale ? "border-amber-300/40 text-amber-100" : "border-lime-300/40 text-lime-100"}`}>
              {trajectoryStatus}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setPlannerPhase("ANALYSIS")}
              className={`border px-3 py-2 text-left transition ${
                plannerPhase === "ANALYSIS"
                  ? "border-cyan-300 bg-cyan-300 text-slate-950"
                  : "border-lime-300/30 text-lime-100 hover:border-lime-300/60 hover:bg-lime-300/10"
              }`}
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em]">Analysis</span>
              <span className={`mt-1 block text-[10px] ${plannerPhase === "ANALYSIS" ? "text-slate-800" : "text-zinc-500"}`}>Trajectory Review, Flight Dynamics, Optimization, Operations</span>
            </button>
            <button
              type="button"
              onClick={() => setPlannerPhase("REPORTS")}
              className={`border px-3 py-2 text-left transition ${
                plannerPhase === "REPORTS"
                  ? "border-cyan-300 bg-cyan-300 text-slate-950"
                  : "border-lime-300/30 text-lime-100 hover:border-lime-300/60 hover:bg-lime-300/10"
              }`}
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em]">Reports</span>
              <span className={`mt-1 block text-[10px] ${plannerPhase === "REPORTS" ? "text-slate-800" : "text-zinc-500"}`}>Mission Report, Analysis Report, Export JSON, CSV, PDF</span>
            </button>
          </div>
          {effectiveTrajectoryStale && (
            <div className="mt-3 border border-amber-300/30 bg-amber-300/[0.05] px-3 py-2 text-xs leading-5 text-amber-100">
              Results generated using an older mission configuration. Analysis and reports remain available for reference, but regenerate trajectory before treating them as current.
            </div>
          )}
        </div>
      )}

      {mission && plannerPhase === "DEFINITION" && (
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

      {mission && plannerPhase === "CURRENT_ORBIT" && (
        <div className="mt-3">
          <OrbitSummaryPanel
            summary={orbitSummary}
            title="Current Orbit"
            subtitle="Read-only starting conditions for the mission design."
          />
        </div>
      )}

      {mission && (plannerPhase === "TARGET_ORBIT" || plannerPhase === "STRATEGY" || plannerPhase === "VALIDATION") && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Current vs Target</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">The mission delta stays visible while the plan is being designed.</p>
            </div>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              {missionDeltaType}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="border border-white/10 bg-black/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300/70">Current Orbit</p>
              <div className="mt-2 grid gap-2">
                <DetailMetric label="Altitude" value={orbitSummary.currentAltitudeKm == null ? "Unavailable" : `${formatNumber(orbitSummary.currentAltitudeKm, 2)} km`} />
                <DetailMetric label="Inclination" value={orbitSummary.inclinationDeg == null ? "Unavailable" : `${formatNumber(orbitSummary.inclinationDeg, 3)} deg`} />
              </div>
            </div>
            <div className="border border-white/10 bg-black/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300/70">Target Orbit</p>
              <div className="mt-2 grid gap-2">
                <DetailMetric label="Altitude" value={targetAltitudeLabel} />
                <DetailMetric label="Inclination" value={targetInclinationLabel} />
              </div>
            </div>
            <div className="border border-white/10 bg-black/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300/70">Mission Delta</p>
              <div className="mt-2 grid gap-2">
                <DetailMetric label="Altitude Change" value={altitudeDeltaKm == null ? "Unavailable" : `${altitudeDeltaKm >= 0 ? "+" : ""}${formatNumber(altitudeDeltaKm, 2)} km`} />
                <DetailMetric label="Inclination Change" value={inclinationDeltaDeg == null ? "Maintain" : `${inclinationDeltaDeg >= 0 ? "+" : ""}${formatNumber(inclinationDeltaDeg, 3)} deg`} />
              </div>
            </div>
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-2">
          <div className="grid gap-1 md:grid-cols-5">
            {analysisWorkspaceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnalysisTab(tab.id)}
                className={`border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition ${
                  analysisTab === tab.id
                    ? "border-cyan-300 bg-cyan-300 text-slate-950"
                    : "border-white/10 text-cyan-100 hover:border-cyan-300/50 hover:bg-cyan-300/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "HEALTH" && actionableMissionFindings.length === 0 && (
        <div className="mt-3 flex justify-end">
          <span className="border border-lime-300/40 px-2 py-1 font-mono text-[10px] uppercase text-lime-100">
            NOMINAL
          </span>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "HEALTH" && actionableMissionFindings.length > 0 && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Findings</p>
            </div>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
              actionableMissionFindings.some((finding) => finding.severity === "BLOCKER")
                ? "border-rose-300/40 text-rose-100"
                : actionableMissionFindings.some((finding) => finding.severity === "WARNING")
                  ? "border-amber-300/40 text-amber-100"
                  : "border-lime-300/40 text-lime-100"
            }`}>
              {`${actionableMissionFindings.length} Finding${actionableMissionFindings.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {actionableMissionFindings.map((finding) => (
              <div key={finding.id} className={`border px-3 py-2 ${
                finding.severity === "BLOCKER"
                  ? "border-rose-300/30 bg-rose-300/[0.06]"
                  : finding.severity === "WARNING"
                    ? "border-amber-300/25 bg-amber-300/[0.045]"
                    : "border-cyan-300/20 bg-cyan-300/[0.035]"
                }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">{finding.category}</p>
                  <p className="font-mono text-[10px] uppercase text-zinc-400">{finding.severity}</p>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">{finding.message}</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">{finding.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "HEALTH" && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
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
            {objectiveProgress.length > 0 && (
              <div className="mt-3 grid gap-2">
                {objectiveProgress.map((objective) => (
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
            )}
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <DetailMetric label="Lifetime" value={lifetimeEstimate.estimatedLifetime} />
              <DetailMetric label="Drag Sensitivity" value={lifetimeEstimate.dragSensitivity} />
              <DetailMetric label="Perigee" value={orbitSummary.perigeeAltitudeKm == null ? "Unavailable" : `${formatNumber(orbitSummary.perigeeAltitudeKm, 2)} km`} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{lifetimeEstimate.rationale}</p>
          </div>

          {constraintViolations.length > 0 && (
            <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Constraint Review</p>
              </div>
              <span className="border border-amber-300/40 px-2 py-1 font-mono text-[10px] uppercase text-amber-100">
                {constraintViolations.length} Finding{constraintViolations.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {constraintViolations.map((violation) => (
                <p key={`${violation.constraint}-${violation.message}`} className={`border px-3 py-2 text-xs leading-5 ${violation.severity === "Violation" ? "border-rose-300/30 bg-rose-300/[0.06] text-rose-100" : "border-amber-300/30 bg-amber-300/[0.06] text-amber-100"}`}>
                  {violation.constraint}: {violation.message}
                </p>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "OPTIMIZATION" && (
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
            {targetSolver.residuals.length > 0 && (
              <div className="mt-3 grid gap-2">
                {targetSolver.residuals.map((residual) => (
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
            )}
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

      {mission && plannerPhase === "TARGET_ORBIT" && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Goals</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Define the desired orbital outcome before choosing maneuvers.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Design Input
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              <label className="grid gap-1 md:col-span-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-300/60">Objective Type</span>
                <select
                  value={objectiveType}
                  onChange={(event) => setObjectiveType(event.target.value)}
                  className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[11px] text-cyan-100 outline-none"
                >
                  <option value="REACH_TARGET_ALTITUDE">Reach Target Altitude</option>
                  <option value="REACH_TARGET_ORBIT">Reach Target Orbit</option>
                  <option value="CIRCULARIZE_ORBIT">Circularize Orbit</option>
                  <option value="CHANGE_INCLINATION">Change Inclination</option>
                  <option value="CHANGE_RAAN">Change RAAN</option>
                  <option value="DEORBIT">Deorbit</option>
                  <option value="CUSTOM_OBJECTIVE">Custom Objective</option>
                </select>
              </label>
              <TargetInput label="Altitude km" value={missionTargets.targetAltitudeKm} onChange={(value) => updateTarget("targetAltitudeKm", value)} />
              <TargetInput label="Inclination deg" value={missionTargets.targetInclinationDeg} onChange={(value) => updateTarget("targetInclinationDeg", value)} />
              <button
                type="button"
                onClick={() => setAdvancedObjectiveOpen((open) => !open)}
                className="border border-cyan-300/20 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10 md:col-span-5"
              >
                Advanced Parameters {advancedObjectiveOpen ? "Open" : "Closed"}
              </button>
              {advancedObjectiveOpen && (
                <>
                  <TargetInput label="Eccentricity" value={missionTargets.targetEccentricity} onChange={(value) => updateTarget("targetEccentricity", value)} />
                  <TargetInput label="RAAN deg" value={missionTargets.targetRaanDeg} onChange={(value) => updateTarget("targetRaanDeg", value)} />
                  <TargetInput label="Arg Perigee deg" value={missionTargets.targetArgumentOfPerigeeDeg} onChange={(value) => updateTarget("targetArgumentOfPerigeeDeg", value)} />
                  <TargetInput label="True Anomaly deg" value={targetTrueAnomalyDeg} onChange={updateTargetTrueAnomaly} />
                </>
              )}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <DetailMetric label="Mission Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
              <DetailMetric label="Current Class" value={orbitSummary.classification} />
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Target Orbit</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Desired endpoint expressed as orbital design goals.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Desired State
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <DetailMetric label="Target Altitude" value={targetAltitudeLabel} />
              <DetailMetric label="Target Inclination" value={targetInclinationLabel} />
              <DetailMetric label="Target Eccentricity" value={targetEccentricityLabel} />
              <DetailMetric label="Target RAAN" value={targetRaanLabel} />
              <DetailMetric label="Target Arg Perigee" value={targetArgumentOfPerigeeLabel} />
              <DetailMetric label="Target True Anomaly" value={targetTrueAnomalyLabel} />
              <DetailMetric label="Mission Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
            </div>
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "OPTIMIZATION" && (
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
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Trade Study Ranking</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Ranked candidate design strategies by cost, time, and mission effect.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {tradeStudy.length} Candidates
              </span>
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

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "OPERATIONS" && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Readiness</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                validationStatus === "Blocked"
                  ? "border-rose-300/40 text-rose-100"
                  : effectiveTrajectoryStale
                    ? "border-amber-300/40 text-amber-100"
                    : "border-lime-300/40 text-lime-100"
              }`}>
                {effectiveTrajectoryStale ? "Regenerate" : validationStatus}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Trajectory" value={trajectoryStatus} />
              <DetailMetric label="Execution Mode" value={missionExecutionModes.find((mode) => mode.id === executionMode)?.label ?? executionMode.replaceAll("_", " ")} />
              <DetailMetric label="Enabled Events" value={String(events.filter((event) => event.enabled).length)} />
              <DetailMetric label="Enabled Burns" value={String(hasEnabledBurnEvents ? events.filter((event) => event.enabled && event.type !== "COAST").length : 0)} />
            </div>
            {actionableMissionFindings.length > 0 && (
              <div className="mt-3 grid gap-2">
                {actionableMissionFindings.map((finding) => (
                <p key={finding.id} className={`border px-3 py-2 text-xs leading-5 ${
                  finding.severity === "BLOCKER" ? "border-rose-300/30 bg-rose-300/[0.06] text-rose-100" : "border-amber-300/30 bg-amber-300/[0.06] text-amber-100"
                }`}>
                  {finding.category}: {finding.message}
                </p>
                ))}
              </div>
            )}
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Execution Risks</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Mission-specific risks from the active trajectory, validation, constraints, and spacecraft profile.</p>
              </div>
              <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                performanceStatus === "Critical"
                  ? "border-rose-300/40 text-rose-100"
                  : performanceStatus === "Caution"
                    ? "border-amber-300/40 text-amber-100"
                    : "border-lime-300/40 text-lime-100"
              }`}>
                {performanceStatus}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Total dV" value={`${formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Fuel Used" value={`${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} kg`} />
              <DetailMetric label="Fuel Margin" value={missionAnalytics.fuelBudget.fuelMarginPercent == null ? "Profile not loaded" : `${formatNumber(missionAnalytics.fuelBudget.fuelMarginPercent, 1)}%`} />
              <DetailMetric label="Constraints" value={constraintViolations.length === 0 ? "Clear" : `${constraintViolations.length} Finding${constraintViolations.length === 1 ? "" : "s"}`} />
            </div>
            {constraintViolations.length > 0 && (
              <div className="mt-3 grid gap-2">
                {constraintViolations.map((violation) => (
                <p key={`${violation.constraint}-${violation.message}`} className={`border px-3 py-2 text-xs leading-5 ${violation.severity === "Violation" ? "border-rose-300/30 bg-rose-300/[0.06] text-rose-100" : "border-amber-300/30 bg-amber-300/[0.06] text-amber-100"}`}>
                  {violation.constraint}: {violation.message}
                </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "TRAJECTORY" && templateGroups.length > 0 && (
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

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && (analysisTab === "TRAJECTORY" || analysisTab === "HEALTH") && (
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
          </div>
        </div>
      )}

      {mission && plannerPhase === "ANALYSIS" && hasGeneratedTrajectory && analysisTab === "AUDIT" && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Backend Capability Review</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Platform maturity notes. These are not current mission failures unless explicitly required by the mission objective.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {capabilityFindings.length} Items
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {capabilityFindings.map((finding) => (
                <div key={finding.id} className="border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{finding.capability}</p>
                    <p className="font-mono text-[10px] uppercase text-cyan-100">{finding.status} · {finding.severity}</p>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">{finding.message}</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">{finding.recommendation}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Orekit Event Detector Status</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Available Orekit detector classes and current integration status.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Orekit 13
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {eventDetectorCapabilities.map((finding) => (
                <div key={finding.id} className="border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{finding.capability}</p>
                    <p className="font-mono text-[10px] uppercase text-cyan-100">{finding.status}</p>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">{finding.message}</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">{finding.recommendation}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Solver Capability Matrix</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Capability maturity versus professional flight-dynamics tool expectations.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Audit Only
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {backendCapabilityMatrix.map((item) => (
                <div key={item.capability} className="grid gap-2 border border-white/10 bg-black/20 p-2 md:grid-cols-[1.2fr_0.8fr_2fr]">
                  <p className="text-xs font-semibold text-white">{item.capability}</p>
                  <p className="font-mono text-[10px] uppercase text-cyan-100">Current {item.currentStatus}</p>
                  <p className="text-[11px] leading-5 text-zinc-500">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mission && plannerPhase === "REPORTS" && hasGeneratedTrajectory && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Products</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Export mission and analysis products after propagation.</p>
            </div>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              Reports
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <DetailMetric label="Mission Report" value="JSON" />
            <DetailMetric label="Analysis Report" value="Included" />
            <DetailMetric label="Delta-V Report" value={`${formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s`} />
            <DetailMetric label="Engineering Audit" value={`${capabilityFindings.length + eventDetectorCapabilities.length} Items`} />
          </div>
          <button
            type="button"
            onClick={() => exportMissionReport({ mission, events, orbitSummary, propagationProfile, trajectoryOverlay, missionValidation: missionValidationReview, missionTargets, missionConstraints, monteCarloSettings, relativeMotionSettings, groundStation, coverageSettings, constellationConfig })}
            className="mt-3 w-full border border-cyan-300/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950"
          >
            Export Mission Report JSON
          </button>
        </div>
      )}

      {mission && plannerPhase === "REPORTS" && hasGeneratedTrajectory && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Additional Export Formats</p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <DetailMetric label="Export JSON" value="Available" />
            <DetailMetric label="Export CSV" value="Planned" />
            <DetailMetric label="Export PDF" value="Planned" />
            <DetailMetric label="Diagnostics" value="Strategy phase" />
          </div>
        </div>
      )}

      {mission && plannerPhase === "VALIDATION" && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Target Orbit Summary</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Pre-run target state and estimated mission cost.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Review
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <DetailMetric label="Objective Type" value={objectiveType.replaceAll("_", " ")} />
              <DetailMetric label="Execution Mode" value={missionExecutionModes.find((mode) => mode.id === executionMode)?.label ?? executionMode.replaceAll("_", " ")} />
              <DetailMetric label="Target Altitude" value={targetAltitudeLabel} />
              <DetailMetric label="Target Inclination" value={targetInclinationLabel} />
              <DetailMetric label="Target Eccentricity" value={targetEccentricityLabel} />
              <DetailMetric label="Target RAAN" value={targetRaanLabel} />
              <DetailMetric label="Target Arg Perigee" value={targetArgumentOfPerigeeLabel} />
              <DetailMetric label="Target True Anomaly" value={targetTrueAnomalyLabel} />
              <DetailMetric label="Mission Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
              <DetailMetric label="Estimated Delta-V" value={`${formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s`} />
              <DetailMetric label="Estimated Fuel" value={`${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} kg`} />
              <DetailMetric label="Burn Count" value={String(analysis.burnCount)} />
              <DetailMetric label="Transfer Duration" value={secondsToDurationLabel(missionAnalytics.totalCoastSeconds)} />
            </div>
          </div>

          <div className="border border-cyan-300/15 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Constraints</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Limits used for generation checks and post-run health review.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Pre-Run
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              <TargetInput label="Max burn s" value={missionConstraints.maxBurnDurationSeconds} onChange={(value) => updateConstraint("maxBurnDurationSeconds", value)} />
              <TargetInput label="Max dV m/s" value={missionConstraints.maxSingleBurnDeltaVMps} onChange={(value) => updateConstraint("maxSingleBurnDeltaVMps", value)} />
              <TargetInput label="Reserve %" value={missionConstraints.fuelReservePercent} onChange={(value) => updateConstraint("fuelReservePercent", value)} />
              <TargetInput label="Min perigee km" value={missionConstraints.minPerigeeAltitudeKm} onChange={(value) => updateConstraint("minPerigeeAltitudeKm", value)} />
              <TargetInput label="Max eclipse s" value={missionConstraints.maxEclipseDurationSeconds} onChange={(value) => updateConstraint("maxEclipseDurationSeconds", value)} />
            </div>
            {generateActionBlocker && (
              <div className="mt-3 border border-rose-300/30 bg-rose-300/[0.06] px-3 py-2 text-xs leading-5 text-rose-100">
                {generateActionBlocker}
              </div>
            )}
          </div>

          {missionValidationReview.errors.length === 0 && missionValidationReview.warnings.length === 0 ? (
            <div className="flex justify-end xl:col-span-2">
              <span className="border border-lime-300/40 px-2 py-1 font-mono text-[10px] uppercase text-lime-100">
                NOMINAL
              </span>
            </div>
          ) : (
            <div className="border border-cyan-300/15 bg-black/25 p-3 xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Validation Findings</p>
                </div>
                <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${
                  validationStatus === "Blocked"
                    ? "border-rose-300/40 text-rose-100"
                    : "border-amber-300/40 text-amber-100"
                }`}>
                  {validationStatus}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {missionValidationReview.errors.length > 0 && (
                  <div className="border border-rose-300/20 bg-rose-300/[0.04] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-rose-100">Blockers</p>
                    <div className="mt-2 space-y-1">
                      {missionValidationReview.errors.map((error) => (
                        <p key={error} className="text-xs leading-5 text-rose-100">{error}</p>
                      ))}
                    </div>
                  </div>
                )}
                {missionValidationReview.warnings.length > 0 && (
                  <div className="border border-amber-300/20 bg-amber-300/[0.04] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100">Warnings</p>
                    <div className="mt-2 space-y-1">
                      {missionValidationReview.warnings.map((warning) => (
                        <p key={warning} className="text-xs leading-5 text-amber-100">{warning}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border border-cyan-300/15 bg-black/25 p-3 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Execution Settings Summary</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Read-only review of the propagation configuration selected in Strategy.</p>
              </div>
              <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                Review Only
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <DetailMetric label="Propagator" value={propagationProfile?.propagatorType.replaceAll("_", " ") ?? mission.propagatorType.replaceAll("_", " ")} />
              <DetailMetric label="Integrator" value={integratorSummary(propagationProfile, capabilities)} />
              <DetailMetric label="Force Models" value={forceModelSummary(propagationProfile)} />
              <DetailMetric label="Gravity" value={propagationProfile ? `${propagationProfile.gravityDegree}x${propagationProfile.gravityOrder}` : "Profile loading"} />
              <DetailMetric label="Dry Mass" value={propagationProfile ? `${formatNumber(propagationProfile.dryMassKg, 3)} kg` : "Profile loading"} />
              <DetailMetric label="Fuel Mass" value={propagationProfile ? `${formatNumber(propagationProfile.fuelMassKg, 3)} kg` : "Profile loading"} />
              <DetailMetric label="Drag" value={propagationProfile?.dragEnabled ? `Cd ${formatNumber(propagationProfile.dragCoefficient, 3)} / ${formatNumber(propagationProfile.dragAreaM2, 3)} m2` : "Disabled"} />
              <DetailMetric label="SRP" value={propagationProfile?.solarRadiationPressureEnabled ? `Cr ${formatNumber(propagationProfile.reflectivityCoefficient, 3)} / ${formatNumber(propagationProfile.srpAreaM2, 3)} m2` : "Disabled"} />
            </div>
          </div>
        </div>
      )}

      {mission && plannerPhase === "STRATEGY" && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Mission Strategy</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Choose the maneuver strategy and author the mission sequence.</p>
            </div>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              GMAT Sequence
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <div className="border border-white/10 bg-black/25 p-2 md:col-span-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Mission Execution Mode</p>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {missionExecutionModes.map((mode) => (
                  <div
                    key={mode.id}
                    className={`border p-3 text-left transition ${
                      executionMode === mode.id
                        ? "border-cyan-300 bg-cyan-300 text-slate-950"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em]">{mode.label}</span>
                    <span className={`mt-1 block text-[11px] leading-5 ${executionMode === mode.id ? "text-slate-800" : "text-zinc-500"}`}>{mode.helper}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Execution mode is derived from enabled timeline events: burns create a Maneuver Mission, coast-only timelines create a Coast Mission, and empty timelines remain Propagation Only.
              </p>
            </div>
            <button type="button" onClick={onOpenManeuverTemplates} className="border border-cyan-300/45 px-3 py-2 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10">
              Maneuver Templates
            </button>
            <button type="button" onClick={() => onCreateEvent("IMPULSIVE_BURN")} className="border border-amber-300/50 px-3 py-2 font-mono text-[10px] uppercase text-amber-100 transition hover:border-amber-300 hover:bg-amber-300/10">
              Manual Impulse
            </button>
            <button type="button" onClick={() => onCreateEvent("FINITE_BURN")} className="border border-rose-300/50 px-3 py-2 font-mono text-[10px] uppercase text-rose-100 transition hover:border-rose-300 hover:bg-rose-300/10">
              Manual Finite Burn
            </button>
            <button type="button" onClick={() => onCreateEvent("COAST")} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
              Coast Segment
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <DetailMetric label="Execution Mode" value={missionExecutionModes.find((mode) => mode.id === executionMode)?.label ?? executionMode.replaceAll("_", " ")} />
            <DetailMetric label="Estimated Delta-V" value={`${formatNumber(missionAnalytics.totalDeltaVMps, 2)} m/s`} />
            <DetailMetric label="Estimated Fuel" value={`${formatNumber(missionAnalytics.fuelBudget.consumedFuelKg, 3)} kg`} />
            <DetailMetric label="Transfer Time" value={secondsToDurationLabel(missionAnalytics.totalCoastSeconds)} />
            <DetailMetric label="Maneuver Events" value={`${analysis.burnCount} burns`} />
          </div>
          {nextStepBlocker && (
            <div className="mt-3 border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-xs leading-5 text-amber-100">
              {nextStepBlocker}
            </div>
          )}
        </div>
      )}

      {mission && plannerPhase === "STRATEGY" && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <button
            type="button"
            onClick={() => setStrategyAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Advanced Execution Settings</span>
              <span className="mt-1 block text-[11px] leading-5 text-zinc-500">Editable mission execution profile used by trajectory generation: propagator, integrator, force models, and spacecraft parameters.</span>
            </span>
            <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
              {strategyAdvancedOpen ? "Open" : "Closed"}
            </span>
          </button>
          {strategyAdvancedOpen && (
            <div className="mt-3 border-t border-white/10 pt-3">
              {propagationProfile ? (
                <div className="grid gap-3">
                  <PropagationProfileEditor
                    profile={propagationProfile}
                    capabilities={capabilities}
                    status={propagationProfileStatus}
                    surface="planner"
                    onDraftChange={onStagePropagationProfile}
                    defaultShowAdvanced
                  />
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
                      {trajectoryCadenceError ?? `Allowed range: ${missionTrajectoryMinStepSeconds}-${missionTrajectoryMaxStepSeconds} seconds. This value is sent to the trajectory API.`}
                    </span>
                  </label>
                </div>
              ) : (
                <div className="border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-xs leading-5 text-amber-100">
                  Propagation profile is loading. Strategy execution settings will appear when the backend profile is available.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mission && plannerPhase === "STRATEGY" && (
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

      {mission && plannerPhase === "STRATEGY" && (
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
      )}

      {mission && plannerPhase !== "ANALYSIS" && plannerPhase !== "REPORTS" && (
        <div className="sticky bottom-0 z-20 mt-3 border-t border-cyan-300/20 bg-[#071016]/95 pt-3 backdrop-blur">
          {plannerPhase === "VALIDATION" ? (
            <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
              <button
                type="button"
                onClick={() => previousPlannerPhase && goToPlannerPhase(previousPlannerPhase)}
                disabled={!previousPlannerPhase}
                className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hasGeneratedTrajectory && !effectiveTrajectoryStale) {
                    setPlannerPhase("ANALYSIS");
                    return;
                  }
                  onGenerateTrajectory(missionDesignSnapshot ?? undefined);
                }}
                disabled={isTrajectoryLoading || Boolean(generateActionBlocker)}
                title={hasGeneratedTrajectory && !effectiveTrajectoryStale ? "Open trajectory analysis workspace." : generateActionBlocker ?? "Generate trajectory using the validated mission design."}
                className={`border border-cyan-300 bg-cyan-300 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60 ${isTrajectoryLoading ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"}`}
              >
                {isTrajectoryLoading ? "Generating" : hasGeneratedTrajectory && !effectiveTrajectoryStale ? "Open Analysis" : trajectoryOverlay ? "Regenerate Trajectory" : "Generate Trajectory"}
              </button>
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() => previousPlannerPhase && goToPlannerPhase(previousPlannerPhase)}
                disabled={!previousPlannerPhase}
                className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                title="Mission draft is retained in the active workspace."
                className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={advancePlannerPhase}
                disabled={!nextPlannerPhase || Boolean(nextStepBlocker)}
                title={nextStepBlocker ?? "Move to the next mission design step."}
                className="border border-cyan-300/45 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {trajectoryOverlay && (plannerPhase === "ANALYSIS" || plannerPhase === "REPORTS") && (
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
