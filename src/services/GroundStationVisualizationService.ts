import type { GroundStation, GroundStationDisplayOptions } from "@/domain/groundOperations";
import type { SatelliteSnapshot } from "@/domain/orbit";
import type {
  ContactLineVisual,
  GroundStationVisualizationModel,
  SatelliteFootprintVisual,
  StationAccessRegionVisual,
} from "@/domain/visualization";
import { satelliteHorizonRadiusMeters, stationAccessRadiusMeters } from "@/services/VisibilityGeometryService";
import { VisibilityService } from "@/services/VisibilityService";

export class GroundStationVisualizationService {
  constructor(private readonly visibilityService = new VisibilityService()) {}

  buildModel(
    assignedStations: GroundStation[],
    display: GroundStationDisplayOptions,
    targetSnapshot: SatelliteSnapshot | null,
  ): GroundStationVisualizationModel {
    const enabledStations = assignedStations.filter((station) => station.enabled);
    const targetState = targetSnapshot?.state ?? null;
    const visibleStationIds = new Set(
      targetState
        ? enabledStations
            .filter((station) => this.visibilityService.computeSample(station, targetState)?.visible)
            .map((station) => station.id)
        : [],
    );

    return {
      markers: display.stations
        ? enabledStations.map((station) => ({
            station,
            isVisible: visibleStationIds.has(station.id),
          }))
        : [],
      satelliteFootprint: display.satelliteFootprints && targetState
        ? this.buildSatelliteFootprint(targetState)
        : null,
      stationAccessRegions: display.stationAccessRegions && targetState
        ? enabledStations.map((station) => this.buildStationAccessRegion(station, targetState.altitudeKm, visibleStationIds.has(station.id)))
        : [],
      contactLines: display.contactLines && targetState
        ? enabledStations
            .filter((station) => visibleStationIds.has(station.id))
            .map<ContactLineVisual>((station) => ({
              id: `ground-station-${station.id}-access-link`,
              name: `${station.name} access link`,
              station,
              satelliteState: targetState,
            }))
        : [],
    };
  }

  private buildSatelliteFootprint(state: NonNullable<SatelliteSnapshot["state"]>): SatelliteFootprintVisual {
    return {
      id: "active-satellite-geometric-horizon-footprint",
      name: `${state.satelliteId} geometric horizon footprint`,
      latitudeDeg: state.latitudeDeg,
      longitudeDeg: state.longitudeDeg,
      radiusMeters: satelliteHorizonRadiusMeters(state.altitudeKm),
    };
  }

  private buildStationAccessRegion(
    station: GroundStation,
    satelliteAltitudeKm: number,
    isVisible: boolean,
  ): StationAccessRegionVisual {
    return {
      id: `ground-station-${station.id}-access-region`,
      name: `${station.name} ${station.minimumElevation.toFixed(1)} deg access region`,
      stationId: station.id,
      latitudeDeg: station.latitude,
      longitudeDeg: station.longitude,
      radiusMeters: stationAccessRadiusMeters(satelliteAltitudeKm, station.minimumElevation, station.altitude),
      isVisible,
    };
  }
}
