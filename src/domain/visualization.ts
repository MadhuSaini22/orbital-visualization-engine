import type { GroundStation } from "@/domain/groundOperations";
import type { OrbitState } from "@/domain/orbit";

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
