import type { BackendMissionTimelineEvent } from "@/services/orbitServerApi";
import type { SatelliteSnapshot } from "@/domain/orbit";

export type TimelineTimeMode = "UTC" | "MET";
export type TimelineScheduleMode = "UTC" | "MET" | "AFTER_EVENT";
export type TimelineZoomPreset = "THIRTY_MIN" | "ONE_HOUR" | "THREE_HOURS" | "SIX_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";
export type TimelineSnapMode = "FREE" | "ONE_MIN" | "FIVE_MIN" | "TEN_MIN" | "THIRTY_MIN" | "ONE_HOUR";

export type MissionTrajectoryOverlay = {
  mission: SatelliteSnapshot | null;
  legacy: SatelliteSnapshot | null;
  generatedAt: string;
  message: string;
  runSignature: string;
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
