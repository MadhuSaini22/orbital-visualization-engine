export type GroundStationSource = "USER" | "CATALOG";

export type GroundStationNetwork =
  | "Custom"
  | "NASA NEN"
  | "ESA ESTRACK"
  | "KSAT"
  | "SSC";

export type GroundStation = {
  id: string;
  workspaceId: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  minimumElevation: number;
  source: GroundStationSource;
  network: GroundStationNetwork;
  enabled: boolean;
};

export type GroundStationDisplayOptions = {
  stations: boolean;
  footprints: boolean;
  contactLines: boolean;
};

export type CatalogGroundStation = Omit<GroundStation, "id" | "workspaceId" | "source" | "enabled"> & {
  catalogId: string;
};

export type VisibilitySample = {
  stationId: string;
  stationName: string;
  timeUtc: string;
  elevationDeg: number;
  azimuthDeg: number;
  rangeKm: number;
  visible: boolean;
};

export type AccessWindow = {
  id: string;
  stationId: string;
  stationName: string;
  passNumber: number;
  aosUtc: string;
  losUtc: string;
  durationSeconds: number;
  maxElevationDeg: number;
  maxElevationTimeUtc: string;
  orbitNumber: number | null;
};

export type StationVisibilitySummary = {
  station: GroundStation;
  current: VisibilitySample | null;
  nextWindow: AccessWindow | null;
  maxElevationDeg: number | null;
  visibilityPercentage: number;
  windows: AccessWindow[];
};

export type GroundStationStatus = "VISIBLE_NOW" | "UPCOMING_PASS" | "NO_ACCESS";

export type GroundOperationsAnalysis = {
  generatedAt: string;
  targetName: string;
  sampleCount: number;
  stationSummaries: StationVisibilitySummary[];
  accessWindows: AccessWindow[];
};
