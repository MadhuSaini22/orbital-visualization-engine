import type { AnalysisResult } from "@/services/AnalysisEngine";
import type { PropagationResult } from "@/services/PropagationEngine";
import type { ScenarioDisplayModel } from "@/domain/scenario";
import type { SatelliteSnapshot } from "@/domain/orbit";
import type { VisualizationModel } from "@/domain/visualization";
import type { MissionTrajectoryOverlay } from "@/components/mission-planning/types";
import { distanceBetweenOrbitStatesKm } from "@/geometry/distance";

export type VisualizationRequest = {
  propagation: PropagationResult;
  analysis: AnalysisResult;
  display: ScenarioDisplayModel;
  selectedSatelliteIds: string[];
  selectedManeuverId: string | null;
  selectedConjunctionId: string | null;
  missionTrajectoryOverlay: MissionTrajectoryOverlay | null;
  groundOpsHorizonSnapshot: SatelliteSnapshot | null;
};

export class VisualizationEngine {
  buildRenderModel(request: VisualizationRequest): VisualizationModel {
    const snapshots = request.propagation.currentSnapshots;
    const orbitSnapshots = request.propagation.orbitSnapshots;
    const displayOrbitSnapshots = this.buildOrbitSnapshots(orbitSnapshots, request.display, request.missionTrajectoryOverlay);
    const selectedSnapshot = this.resolveSelectedSnapshot(snapshots, request.selectedSatelliteIds);
    const groundOperationsTargetSnapshot = this.buildGroundOperationsTargetSnapshot(selectedSnapshot, displayOrbitSnapshots);
    const effectiveGroundOperationsTargetSnapshot = request.groundOpsHorizonSnapshot ?? groundOperationsTargetSnapshot;
    const pathLayers = this.buildPathLayers(
      snapshots,
      displayOrbitSnapshots,
      request.propagation.groundTrackSnapshots,
      groundOperationsTargetSnapshot,
      request.selectedSatelliteIds,
      request.display.allOrbits,
    );
    const maneuverSnapshots = request.analysis.maneuverSnapshots;
    const conjunctionSnapshots = request.analysis.conjunctionSnapshots;
    const selectedManeuver = this.resolveSelectedManeuver(maneuverSnapshots, request.selectedManeuverId);
    const selectedConjunction = this.resolveSelectedConjunction(conjunctionSnapshots, request.selectedConjunctionId);
    const rangeMeasurement = this.buildRangeMeasurement(snapshots, request.selectedSatelliteIds, request.display.range);
    const layerState = {
      range: {
        requested: request.display.range,
        available: snapshots.length >= 2,
        visible: Boolean(rangeMeasurement),
      },
      maneuvers: {
        requested: request.display.maneuvers,
        available: maneuverSnapshots.length > 0,
        visible: request.display.maneuvers && maneuverSnapshots.length > 0,
      },
      conjunctions: {
        requested: request.display.conjunctions,
        available: snapshots.length >= 2 && conjunctionSnapshots.length > 0,
        visible: request.display.conjunctions && snapshots.length >= 2 && conjunctionSnapshots.length > 0,
      },
    };

    return {
      cesium: {
        snapshots,
        orbitSnapshots: displayOrbitSnapshots,
        orbitPathSnapshots: pathLayers.orbitPathSnapshots,
        trailSnapshots: pathLayers.trailSnapshots,
        groundTrackSnapshots: pathLayers.groundTrackSnapshots,
        rangeMeasurement,
        selectedSatelliteIds: request.selectedSatelliteIds,
        showAllOrbits: request.display.allOrbits,
        showLabels: request.display.labels,
        currentGmstRad: this.resolveDisplayGmstRad(selectedSnapshot, snapshots),
        maneuverSnapshots,
        selectedManeuverId: selectedManeuver?.event.id ?? null,
        showManeuvers: layerState.maneuvers.visible,
        conjunctionSnapshots,
        selectedConjunctionId: selectedConjunction?.event.id ?? null,
        showConjunctions: layerState.conjunctions.visible,
        groundStationVisualization: request.analysis.groundStationVisualization,
        groundOperationsGroundTrackSnapshot: groundOperationsTargetSnapshot,
      },
      selectedManeuver,
      selectedConjunction,
      selectedSnapshot,
      groundOperationsTargetSnapshot: effectiveGroundOperationsTargetSnapshot,
      layerState,
    };
  }

  private buildOrbitSnapshots(
    orbitSnapshots: SatelliteSnapshot[],
    display: ScenarioDisplayModel,
    missionTrajectoryOverlay: MissionTrajectoryOverlay | null,
  ) {
    const overlays = display.missionComparison && missionTrajectoryOverlay
      ? [missionTrajectoryOverlay.legacy, missionTrajectoryOverlay.mission].filter((snapshot): snapshot is SatelliteSnapshot => snapshot !== null)
      : [];
    return overlays.length > 0 ? [...orbitSnapshots, ...overlays] : orbitSnapshots;
  }

  private resolveSelectedSnapshot(snapshots: SatelliteSnapshot[], selectedSatelliteIds: string[]) {
    const latestSelectedId = selectedSatelliteIds.at(-1) ?? null;
    return snapshots.find((item) => item.satellite.id === latestSelectedId) ?? snapshots[0];
  }

  private buildGroundOperationsTargetSnapshot(
    selectedSnapshot: SatelliteSnapshot | undefined,
    displayOrbitSnapshots: SatelliteSnapshot[],
  ): SatelliteSnapshot | null {
    if (!selectedSnapshot) {
      return null;
    }
    const orbitSnapshot = displayOrbitSnapshots.find((item) => item.satellite.id === selectedSnapshot.satellite.id);
    return {
      ...selectedSnapshot,
      trajectory: orbitSnapshot?.trajectory ?? selectedSnapshot.trajectory,
      futureTrajectory: orbitSnapshot?.futureTrajectory ?? selectedSnapshot.futureTrajectory,
      pastTrail: orbitSnapshot?.pastTrail ?? selectedSnapshot.pastTrail,
      groundTrack: orbitSnapshot?.groundTrack ?? selectedSnapshot.groundTrack,
    };
  }

  private buildPathLayers(
    snapshots: SatelliteSnapshot[],
    orbitSnapshots: SatelliteSnapshot[],
    propagatedGroundTrackSnapshots: SatelliteSnapshot[],
    groundOperationsTargetSnapshot: SatelliteSnapshot | null,
    selectedSatelliteIds: string[],
    showAllOrbits: boolean,
  ) {
    const isLayerVisible = (snapshot: SatelliteSnapshot) => showAllOrbits || selectedSatelliteIds.includes(snapshot.satellite.id);
    const pathSourceSnapshots = orbitSnapshots.length > 0 ? orbitSnapshots : snapshots;
    const orbitPathSnapshots = pathSourceSnapshots.filter((snapshot) => snapshot.satellite.visual.showOrbit && isLayerVisible(snapshot));
    const trailSnapshots = orbitSnapshots.filter((snapshot) => snapshot.satellite.visual.showTrail && isLayerVisible(snapshot));
    const groundTrackSnapshots = propagatedGroundTrackSnapshots.filter((snapshot) => snapshot.satellite.visual.showGroundTrack);

    if (
      groundOperationsTargetSnapshot?.groundTrack?.length
      && groundOperationsTargetSnapshot.satellite.visual.showGroundTrack
    ) {
      const existingIndex = groundTrackSnapshots.findIndex(
        (snapshot) => snapshot.satellite.id === groundOperationsTargetSnapshot.satellite.id,
      );
      if (existingIndex === -1) {
        groundTrackSnapshots.push(groundOperationsTargetSnapshot);
      } else if (!groundTrackSnapshots[existingIndex].groundTrack?.length) {
        groundTrackSnapshots[existingIndex] = groundOperationsTargetSnapshot;
      }
    }

    return {
      orbitPathSnapshots,
      trailSnapshots,
      groundTrackSnapshots,
    };
  }

  private resolveSelectedManeuver(
    maneuverSnapshots: AnalysisResult["maneuverSnapshots"],
    selectedManeuverId: string | null,
  ) {
    return maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId) ?? maneuverSnapshots[0] ?? null;
  }

  private resolveSelectedConjunction(
    conjunctionSnapshots: AnalysisResult["conjunctionSnapshots"],
    selectedConjunctionId: string | null,
  ) {
    return conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;
  }

  private buildRangeMeasurement(
    snapshots: SatelliteSnapshot[],
    selectedSatelliteIds: string[],
    showRange: boolean,
  ) {
    if (!showRange) {
      return null;
    }

    const primarySnapshot = snapshots.find((item) => item.satellite.id === (selectedSatelliteIds[0] ?? ""));
    const secondarySnapshot = snapshots.find((item) => item.satellite.id === (selectedSatelliteIds[1] ?? ""));
    const distanceKm = distanceBetweenOrbitStatesKm(
      primarySnapshot?.state ?? null,
      secondarySnapshot?.state ?? null,
    );

    return primarySnapshot && secondarySnapshot && distanceKm !== null
      ? {
          primary: primarySnapshot,
          secondary: secondarySnapshot,
          distanceKm,
        }
      : null;
  }

  private resolveDisplayGmstRad(selectedSnapshot: SatelliteSnapshot | undefined, snapshots: SatelliteSnapshot[]) {
    const currentDisplayGmstRadRaw = selectedSnapshot?.state?.gmstRad ?? snapshots.find((item) => item.state?.gmstRad)?.state?.gmstRad;
    return typeof currentDisplayGmstRadRaw === "number"
      ? Math.round(currentDisplayGmstRadRaw / 0.004) * 0.004
      : undefined;
  }
}
