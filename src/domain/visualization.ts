import type { GroundStation } from "@/domain/groundOperations";
import type { ConjunctionSnapshot } from "@/domain/conjunction";
import type { ManeuverSnapshot } from "@/domain/maneuver";
import type { OrbitState, RangeMeasurement, SatelliteSnapshot } from "@/domain/orbit";

export type GroundStationMarkerVisual = {
  station: GroundStation;
  isVisible: boolean;
};

export type SatelliteFootprintVisual = {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  radiusMeters: number;
};

export type StationAccessRegionVisual = {
  id: string;
  name: string;
  stationId: string;
  latitudeDeg: number;
  longitudeDeg: number;
  radiusMeters: number;
  isVisible: boolean;
};

export type ContactLineVisual = {
  id: string;
  name: string;
  station: GroundStation;
  satelliteState: OrbitState;
};

export type GroundStationVisualizationModel = {
  markers: GroundStationMarkerVisual[];
  satelliteFootprint: SatelliteFootprintVisual | null;
  stationAccessRegions: StationAccessRegionVisual[];
  contactLines: ContactLineVisual[];
};

export type VisualizationLayerState = {
  range: {
    requested: boolean;
    available: boolean;
    visible: boolean;
  };
  maneuvers: {
    requested: boolean;
    available: boolean;
    visible: boolean;
  };
  conjunctions: {
    requested: boolean;
    available: boolean;
    visible: boolean;
  };
};

export type CesiumRenderModel = {
  snapshots: SatelliteSnapshot[];
  orbitSnapshots: SatelliteSnapshot[];
  orbitPathSnapshots: SatelliteSnapshot[];
  trailSnapshots: SatelliteSnapshot[];
  groundTrackSnapshots: SatelliteSnapshot[];
  rangeMeasurement: RangeMeasurement | null;
  selectedSatelliteIds: string[];
  showAllOrbits: boolean;
  showLabels: boolean;
  currentGmstRad?: number;
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  showManeuvers: boolean;
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  groundStationVisualization: GroundStationVisualizationModel;
  groundOperationsGroundTrackSnapshot: SatelliteSnapshot | null;
};

export type VisualizationModel = {
  cesium: CesiumRenderModel;
  selectedManeuver: ManeuverSnapshot | null;
  selectedConjunction: ConjunctionSnapshot | null;
  selectedSnapshot: SatelliteSnapshot | undefined;
  groundOperationsTargetSnapshot: SatelliteSnapshot | null;
  layerState: VisualizationLayerState;
};
