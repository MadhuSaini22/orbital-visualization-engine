import type { BackendMissionTimelineEvent, BackendPropagationProfile } from "@/services/orbitServerApi";
import type { SatelliteSnapshot } from "@/domain/orbit";

export type TimelineTimeMode = "UTC" | "MET";
export type TimelineScheduleMode = "UTC" | "MET" | "AFTER_EVENT";
export type TimelineZoomPreset = "THIRTY_MIN" | "ONE_HOUR" | "THREE_HOURS" | "SIX_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";
export type TimelineSnapMode = "FREE" | "ONE_MIN" | "FIVE_MIN" | "TEN_MIN" | "THIRTY_MIN" | "ONE_HOUR";

export type MissionGenerationSnapshot = {
  mission: {
    id: string;
    scenarioStart: string;
    scenarioEnd: string;
    propagatorType: string;
  };
  executionProfile: Omit<BackendPropagationProfile, "createdAt" | "updatedAt"> | null;
  sampleCadenceSeconds: number | null;
  events: Array<{
    id: string;
    type: BackendMissionTimelineEvent["type"];
    sequenceIndex: number;
    enabled: boolean;
    executionTime: string;
    parameters: BackendMissionTimelineEvent["parameters"];
  }>;
  currentOrbit: Record<string, unknown>;
  targetOrbit: Record<string, unknown>;
  objectiveType: string;
  executionMode: string;
  missionConstraints: Record<string, unknown>;
};

export type MissionTrajectoryOverlay = {
  mission: SatelliteSnapshot | null;
  legacy: SatelliteSnapshot | null;
  generatedAt: string;
  message: string;
  runSignature: string;
  designSignature: string | null;
  generationSnapshot: MissionGenerationSnapshot | null;
  sampleCadenceSeconds: number;
  stale: boolean;
};

export type TimelineLayoutBlock = {
  event: BackendMissionTimelineEvent;
  offsetSeconds: number;
  durationSeconds: number;
  widthPercent: number;
  startPercent: number;
};

export type TimelineLayoutModel = {
  missionDurationSeconds: number;
  visibleSeconds: number;
  trackWidthPercent: number;
  blocks: TimelineLayoutBlock[];
  cursors: {
    missionStart: number;
    missionEnd: number;
    currentSimTime: number | null;
    selectedEvent: number | null;
  };
};

export type TimelineInteractionModel = {
  snapMode: TimelineSnapMode;
  zoomPreset: TimelineZoomPreset;
  customVisibleSeconds: number;
};
