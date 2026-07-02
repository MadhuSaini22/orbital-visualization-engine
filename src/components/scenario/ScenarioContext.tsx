"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { GroundTrackRangeId } from "@/components/GroundTrackMiniMap";
import type { MissionTrajectoryOverlay } from "@/components/mission-planning/types";
import type { ConjunctionEvent } from "@/domain/conjunction";
import type { ManeuverEvent } from "@/domain/maneuver";
import type { SatelliteObject, SatelliteVisualSettings } from "@/domain/orbit";
import {
  defaultSatelliteVisualSettings,
  satelliteForRendering,
  satelliteVisualsFromSatellites,
  stripSatelliteVisual,
  type ScenarioActiveDataSource,
  type ScenarioDisplayModel,
  type ScenarioFrameMode,
  type ScenarioState,
} from "@/domain/scenario";
import type {
  BackendAnalysisConfigResponse,
  BackendCapabilityRegistry,
  BackendMission,
  BackendMissionTimelineEvent,
  BackendPropagationProfile,
  UpdatePropagationProfileRequest,
} from "@/services/orbitServerApi";
import {
  readMissionLibrary,
  readMissionTemplateLibrary,
  readOrbitLibrary,
  readOrbitTemplateLibrary,
  type MissionLibraryState,
  type MissionTemplateLibraryState,
  type OrbitTemplateLibraryState,
  type StoredOrbit,
} from "@/services/workspaceStorage";

type ScenarioActions = {
  setActiveDataSource: Dispatch<SetStateAction<ScenarioActiveDataSource>>;
  setManualOrbitId: Dispatch<SetStateAction<string | null>>;
  setSatellites: Dispatch<SetStateAction<SatelliteObject[]>>;
  setSelectedSatelliteIds: Dispatch<SetStateAction<string[]>>;
  setSimTime: Dispatch<SetStateAction<Date>>;
  setTrajectoryAnchorTime: Dispatch<SetStateAction<Date>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setSpeed: Dispatch<SetStateAction<number>>;
  setCustomSpeedInput: Dispatch<SetStateAction<string>>;
  setFrameMode: Dispatch<SetStateAction<ScenarioFrameMode>>;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
  setShowAllOrbits: Dispatch<SetStateAction<boolean>>;
  setShowRangeCheck: Dispatch<SetStateAction<boolean>>;
  setGroundTrackRangeId: Dispatch<SetStateAction<GroundTrackRangeId>>;
  setShowManeuvers: Dispatch<SetStateAction<boolean>>;
  setShowMissionComparison: Dispatch<SetStateAction<boolean>>;
  setShowConjunctions: Dispatch<SetStateAction<boolean>>;
  setSatelliteVisual: (satelliteId: string, key: keyof SatelliteVisualSettings, value: boolean) => void;
  setManeuverEvents: Dispatch<SetStateAction<ManeuverEvent[]>>;
  setSelectedManeuverId: Dispatch<SetStateAction<string | null>>;
  setMission: Dispatch<SetStateAction<BackendMission | null>>;
  setMissionTimelineEvents: Dispatch<SetStateAction<BackendMissionTimelineEvent[]>>;
  setSelectedTimelineEventId: Dispatch<SetStateAction<string | null>>;
  setMissionTrajectoryOverlay: Dispatch<SetStateAction<MissionTrajectoryOverlay | null>>;
  setImportedMissionSpacecraftId: Dispatch<SetStateAction<string | null>>;
  setMissionPropagationProfile: Dispatch<SetStateAction<BackendPropagationProfile | null>>;
  setPendingMissionPropagationProfileUpdate: Dispatch<SetStateAction<UpdatePropagationProfileRequest | null>>;
  setConjunctionEvents: Dispatch<SetStateAction<ConjunctionEvent[]>>;
  setSelectedConjunctionId: Dispatch<SetStateAction<string | null>>;
  setOrbitLibrary: Dispatch<SetStateAction<StoredOrbit[]>>;
  setMissionLibrary: Dispatch<SetStateAction<MissionLibraryState>>;
  setTemplateLibrary: Dispatch<SetStateAction<MissionTemplateLibraryState>>;
  setOrbitTemplateLibrary: Dispatch<SetStateAction<OrbitTemplateLibraryState>>;
  setActiveWorkspaceOrbitId: Dispatch<SetStateAction<string | null>>;
  setActiveWorkspaceMissionId: Dispatch<SetStateAction<string | null>>;
  setAnalysisConfig: Dispatch<SetStateAction<BackendAnalysisConfigResponse | null>>;
  setCapabilities: Dispatch<SetStateAction<BackendCapabilityRegistry>>;
};

type ScenarioContextValue = {
  scenario: ScenarioState;
  satellites: SatelliteObject[];
  actions: ScenarioActions;
};

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

function applyStateAction<T>(current: T, action: SetStateAction<T>) {
  return typeof action === "function" ? (action as (value: T) => T)(current) : action;
}

function initialDisplay(): ScenarioDisplayModel {
  return {
    orbit: true,
    trail: false,
    labels: true,
    names: true,
    groundTrack: false,
    stations: true,
    stationAccessRegions: true,
    satelliteFootprints: true,
    contactLines: true,
    conics: true,
    sensors: false,
    vectors: true,
    maneuvers: false,
    conjunctions: false,
    range: false,
    allOrbits: false,
    missionComparison: false,
    satelliteVisuals: {},
  };
}

export function ScenarioProvider({
  workspaceId,
  initialSimulationTime,
  fallbackCapabilities,
  children,
}: {
  workspaceId: string;
  initialSimulationTime: Date;
  fallbackCapabilities: BackendCapabilityRegistry;
  children: ReactNode;
}) {
  const [activeDataSource, setActiveDataSource] = useState<ScenarioActiveDataSource>("sample");
  const [manualOrbitId, setManualOrbitId] = useState<string | null>(null);
  const [scenarioSatellites, setScenarioSatellites] = useState<ScenarioState["satellites"]>([]);
  const [selectedSatelliteIds, setSelectedSatelliteIds] = useState<string[]>([]);
  const [simTime, setSimTime] = useState(() => initialSimulationTime);
  const [trajectoryAnchorTime, setTrajectoryAnchorTime] = useState(() => initialSimulationTime);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [customSpeedInput, setCustomSpeedInput] = useState("120");
  const [frameMode, setFrameMode] = useState<ScenarioFrameMode>("earth-fixed");
  const [groundTrackRangeId, setGroundTrackRangeId] = useState<GroundTrackRangeId>("live");
  const [display, setDisplay] = useState<ScenarioDisplayModel>(() => initialDisplay());
  const [maneuverEvents, setManeuverEvents] = useState<ManeuverEvent[]>([]);
  const [selectedManeuverId, setSelectedManeuverId] = useState<string | null>(null);
  const [mission, setMission] = useState<BackendMission | null>(null);
  const [missionTimelineEvents, setMissionTimelineEvents] = useState<BackendMissionTimelineEvent[]>([]);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [missionTrajectoryOverlay, setMissionTrajectoryOverlay] = useState<MissionTrajectoryOverlay | null>(null);
  const [importedMissionSpacecraftId, setImportedMissionSpacecraftId] = useState<string | null>(null);
  const [missionPropagationProfile, setMissionPropagationProfile] = useState<BackendPropagationProfile | null>(null);
  const [pendingMissionPropagationProfileUpdate, setPendingMissionPropagationProfileUpdate] = useState<UpdatePropagationProfileRequest | null>(null);
  const [conjunctionEvents, setConjunctionEvents] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState<string | null>(null);
  const [orbitLibrary, setOrbitLibrary] = useState<StoredOrbit[]>(() => readOrbitLibrary());
  const [missionLibrary, setMissionLibrary] = useState<MissionLibraryState>(() => readMissionLibrary());
  const [templateLibrary, setTemplateLibrary] = useState<MissionTemplateLibraryState>(() => readMissionTemplateLibrary());
  const [orbitTemplateLibrary, setOrbitTemplateLibrary] = useState<OrbitTemplateLibraryState>(() => readOrbitTemplateLibrary());
  const [activeWorkspaceOrbitId, setActiveWorkspaceOrbitId] = useState<string | null>(null);
  const [activeWorkspaceMissionId, setActiveWorkspaceMissionId] = useState<string | null>(null);
  const [analysisConfig, setAnalysisConfig] = useState<BackendAnalysisConfigResponse | null>(null);
  const [capabilities, setCapabilities] = useState<BackendCapabilityRegistry>(fallbackCapabilities);

  const satellites = useMemo(
    () => scenarioSatellites.map((satellite) => satelliteForRendering(satellite, display)),
    [display, scenarioSatellites],
  );

  const setSatellites = useCallback<Dispatch<SetStateAction<SatelliteObject[]>>>((action) => {
    const nextSatellites = applyStateAction(satellites, action);
    setScenarioSatellites(nextSatellites.map(stripSatelliteVisual));
    setDisplay((currentDisplay) => ({
      ...currentDisplay,
      satelliteVisuals: satelliteVisualsFromSatellites(nextSatellites, currentDisplay.satelliteVisuals),
    }));
  }, [satellites]);

  const setSatelliteVisual = useCallback((satelliteId: string, key: keyof SatelliteVisualSettings, value: boolean) => {
    setDisplay((current) => {
      const previousVisual = current.satelliteVisuals[satelliteId] ?? defaultSatelliteVisualSettings;
      return {
        ...current,
        satelliteVisuals: {
          ...current.satelliteVisuals,
          [satelliteId]: {
            ...previousVisual,
            [key]: value,
          },
        },
      };
    });
  }, []);

  const setShowLabels = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, labels: applyStateAction(current.labels, action) }));
  }, []);
  const setShowAllOrbits = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, allOrbits: applyStateAction(current.allOrbits, action) }));
  }, []);
  const setShowRangeCheck = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, range: applyStateAction(current.range, action) }));
  }, []);
  const setShowManeuvers = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, maneuvers: applyStateAction(current.maneuvers, action) }));
  }, []);
  const setShowMissionComparison = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, missionComparison: applyStateAction(current.missionComparison, action) }));
  }, []);
  const setShowConjunctions = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setDisplay((current) => ({ ...current, conjunctions: applyStateAction(current.conjunctions, action) }));
  }, []);

  const scenario = useMemo<ScenarioState>(() => ({
    workspaceId,
    activeDataSource,
    manualOrbitId,
    satellites: scenarioSatellites,
    selectedSatelliteIds,
    simulation: {
      time: simTime,
      trajectoryAnchorTime,
      isPlaying,
      speed,
      customSpeedInput,
      frameMode,
      groundTrackRangeId,
    },
    display,
    maneuvers: {
      events: maneuverEvents,
      selectedManeuverId,
    },
    missions: {
      activeMission: mission,
      timelineEvents: missionTimelineEvents,
      selectedTimelineEventId,
      trajectoryOverlay: missionTrajectoryOverlay,
      importedMissionSpacecraftId,
      propagationProfile: missionPropagationProfile,
      pendingPropagationProfileUpdate: pendingMissionPropagationProfileUpdate,
    },
    conjunctions: {
      events: conjunctionEvents,
      selectedConjunctionId,
    },
    libraries: {
      orbitLibrary,
      missionLibrary,
      templateLibrary,
      orbitTemplateLibrary,
      activeWorkspaceOrbitId,
      activeWorkspaceMissionId,
    },
    analysis: {
      config: analysisConfig,
      capabilities,
    },
  }), [
    activeDataSource,
    activeWorkspaceMissionId,
    activeWorkspaceOrbitId,
    analysisConfig,
    capabilities,
    conjunctionEvents,
    customSpeedInput,
    display,
    frameMode,
    groundTrackRangeId,
    importedMissionSpacecraftId,
    isPlaying,
    manualOrbitId,
    maneuverEvents,
    mission,
    missionLibrary,
    missionPropagationProfile,
    missionTimelineEvents,
    missionTrajectoryOverlay,
    orbitLibrary,
    orbitTemplateLibrary,
    pendingMissionPropagationProfileUpdate,
    scenarioSatellites,
    selectedConjunctionId,
    selectedManeuverId,
    selectedSatelliteIds,
    selectedTimelineEventId,
    simTime,
    speed,
    templateLibrary,
    trajectoryAnchorTime,
    workspaceId,
  ]);

  const actions = useMemo<ScenarioActions>(() => ({
    setActiveDataSource,
    setManualOrbitId,
    setSatellites,
    setSelectedSatelliteIds,
    setSimTime,
    setTrajectoryAnchorTime,
    setIsPlaying,
    setSpeed,
    setCustomSpeedInput,
    setFrameMode,
    setShowLabels,
    setShowAllOrbits,
    setShowRangeCheck,
    setGroundTrackRangeId,
    setShowManeuvers,
    setShowMissionComparison,
    setShowConjunctions,
    setSatelliteVisual,
    setManeuverEvents,
    setSelectedManeuverId,
    setMission,
    setMissionTimelineEvents,
    setSelectedTimelineEventId,
    setMissionTrajectoryOverlay,
    setImportedMissionSpacecraftId,
    setMissionPropagationProfile,
    setPendingMissionPropagationProfileUpdate,
    setConjunctionEvents,
    setSelectedConjunctionId,
    setOrbitLibrary,
    setMissionLibrary,
    setTemplateLibrary,
    setOrbitTemplateLibrary,
    setActiveWorkspaceOrbitId,
    setActiveWorkspaceMissionId,
    setAnalysisConfig,
    setCapabilities,
  }), [
    setSatellites,
    setSatelliteVisual,
    setShowAllOrbits,
    setShowConjunctions,
    setShowLabels,
    setShowManeuvers,
    setShowMissionComparison,
    setShowRangeCheck,
  ]);

  const value = useMemo(() => ({ scenario, satellites, actions }), [actions, satellites, scenario]);

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario() {
  const value = useContext(ScenarioContext);
  if (!value) {
    throw new Error("useScenario must be used within ScenarioProvider.");
  }
  return value;
}
