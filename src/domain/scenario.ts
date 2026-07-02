import type { GroundTrackRangeId } from "@/components/GroundTrackMiniMap";
import type { MissionTrajectoryOverlay } from "@/components/mission-planning/types";
import type { ConjunctionEvent } from "@/domain/conjunction";
import type { ManeuverEvent } from "@/domain/maneuver";
import type { SatelliteObject, SatelliteVisualSettings } from "@/domain/orbit";
import type {
  BackendAnalysisConfigResponse,
  BackendCapabilityRegistry,
  BackendMission,
  BackendMissionTimelineEvent,
  BackendPropagationProfile,
  UpdatePropagationProfileRequest,
} from "@/services/orbitServerApi";
import type {
  MissionLibraryState,
  MissionTemplateLibraryState,
  OrbitTemplateLibraryState,
  StoredOrbit,
} from "@/services/workspaceStorage";

export type ScenarioActiveDataSource = "sample" | "endpoint" | "backend" | "manual";
export type ScenarioFrameMode = "earth-fixed" | "inertial";

export type ScenarioDisplayModel = {
  orbit: boolean;
  trail: boolean;
  labels: boolean;
  names: boolean;
  groundTrack: boolean;
  stations: boolean;
  stationAccessRegions: boolean;
  satelliteFootprints: boolean;
  contactLines: boolean;
  conics: boolean;
  sensors: boolean;
  vectors: boolean;
  maneuvers: boolean;
  conjunctions: boolean;
  range: boolean;
  allOrbits: boolean;
  missionComparison: boolean;
  satelliteVisuals: Record<string, SatelliteVisualSettings>;
};

export type ScenarioSatellite = Omit<SatelliteObject, "visual">;

export type ScenarioState = {
  workspaceId: string;
  activeDataSource: ScenarioActiveDataSource;
  manualOrbitId: string | null;
  satellites: ScenarioSatellite[];
  selectedSatelliteIds: string[];
  simulation: {
    time: Date;
    trajectoryAnchorTime: Date;
    isPlaying: boolean;
    speed: number;
    customSpeedInput: string;
    frameMode: ScenarioFrameMode;
    groundTrackRangeId: GroundTrackRangeId;
  };
  display: ScenarioDisplayModel;
  maneuvers: {
    events: ManeuverEvent[];
    selectedManeuverId: string | null;
  };
  missions: {
    activeMission: BackendMission | null;
    timelineEvents: BackendMissionTimelineEvent[];
    selectedTimelineEventId: string | null;
    trajectoryOverlay: MissionTrajectoryOverlay | null;
    importedMissionSpacecraftId: string | null;
    propagationProfile: BackendPropagationProfile | null;
    pendingPropagationProfileUpdate: UpdatePropagationProfileRequest | null;
  };
  conjunctions: {
    events: ConjunctionEvent[];
    selectedConjunctionId: string | null;
  };
  libraries: {
    orbitLibrary: StoredOrbit[];
    missionLibrary: MissionLibraryState;
    templateLibrary: MissionTemplateLibraryState;
    orbitTemplateLibrary: OrbitTemplateLibraryState;
    activeWorkspaceOrbitId: string | null;
    activeWorkspaceMissionId: string | null;
  };
  analysis: {
    config: BackendAnalysisConfigResponse | null;
    capabilities: BackendCapabilityRegistry;
  };
};

export const defaultSatelliteVisualSettings: SatelliteVisualSettings = {
  showMarker: true,
  showLabel: true,
  showOrbit: true,
  showGroundTrack: false,
  showTrail: false,
};

export function stripSatelliteVisual(satellite: SatelliteObject): ScenarioSatellite {
  const scenarioSatellite: Partial<SatelliteObject> = { ...satellite };
  delete scenarioSatellite.visual;
  return scenarioSatellite as ScenarioSatellite;
}

export function satelliteForRendering(
  satellite: ScenarioSatellite,
  display: ScenarioDisplayModel,
): SatelliteObject {
  return {
    ...satellite,
    visual: display.satelliteVisuals[satellite.id] ?? defaultSatelliteVisualSettings,
  };
}

export function satelliteVisualsFromSatellites(
  satellites: SatelliteObject[],
  previous: Record<string, SatelliteVisualSettings> = {},
) {
  return satellites.reduce<Record<string, SatelliteVisualSettings>>((visuals, satellite) => {
    visuals[satellite.id] = satellite.visual ?? previous[satellite.id] ?? defaultSatelliteVisualSettings;
    return visuals;
  }, {});
}
