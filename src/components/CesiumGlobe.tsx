"use client";

import { useEffect, useRef, useState } from "react";
import type { OrbitState, RangeMeasurement, SatelliteSnapshot } from "@/domain/orbit";
import type { ConjunctionSnapshot } from "@/domain/conjunction";
import { getConjunctionTone } from "@/domain/conjunction";
import type { ManeuverSnapshot } from "@/domain/maneuver";
import { getManeuverTone } from "@/domain/maneuver";
import { splitGroundTrackByLongitudeWrap } from "@/geometry/groundTrack";

type CesiumModule = typeof import("cesium");
type Viewer = import("cesium").Viewer;
type Entity = import("cesium").Entity;
type Cartesian3 = import("cesium").Cartesian3;
type PrimitiveCollection = import("cesium").PrimitiveCollection;

type CesiumGlobeProps = {
  snapshots: SatelliteSnapshot[];
  orbitSnapshots: SatelliteSnapshot[];
  rangeMeasurement: RangeMeasurement | null;
  selectedSatelliteIds: string[];
  showAllOrbits: boolean;
  showLabels: boolean;
  focusRequest: { satelliteId: string; sequence: number } | null;
  maneuverFocusRequest: {
    longitudeDeg: number;
    latitudeDeg: number;
    altitudeKm: number;
    sequence: number;
  } | null;
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  showManeuvers: boolean;
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  onSelectConjunction: (conjunctionId: string) => void;
  onSelectManeuver: (maneuverId: string) => void;
  onToggleSatellite: (satelliteId: string) => void;
  resetSignal: number;
};

const palette = [
  "#63e6be",
  "#74c0fc",
  "#ffd43b",
  "#ff8787",
  "#b197fc",
  "#8ce99a",
  "#ffa94d",
  "#66d9e8",
  "#f783ac",
  "#d8f5a2",
];

const DEFAULT_CAMERA_VIEW = {
  longitudeDeg: 78,
  latitudeDeg: 20,
  heightMeters: 28000000,
};

type HoverInfo = {
  name: string;
  noradId: string;
  x: number;
  y: number;
} | null;

function stateToCartesian(Cesium: CesiumModule, state: OrbitState): Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    state.longitudeDeg,
    state.latitudeDeg,
    state.altitudeKm * 1000,
  );
}

function stateToGroundCartesian(Cesium: CesiumModule, state: OrbitState): Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(state.longitudeDeg, state.latitudeDeg, 0);
}

function getManeuverVectorEndpoint(Cesium: CesiumModule, snapshot: ManeuverSnapshot) {
  if (!snapshot.state) {
    return null;
  }

  const [radialMps, tangentialMps, normalMps] = snapshot.event.deltaVVectorMps;
  const vectorMagnitudeMps = Math.sqrt(radialMps ** 2 + tangentialMps ** 2 + normalMps ** 2);

  // Phase 2 uses a scaled visual vector rather than a full post-burn orbital
  // solve. The vector gives users direction/magnitude context without claiming
  // flight-dynamics precision.
  return Cesium.Cartesian3.fromDegrees(
    snapshot.state.longitudeDeg + tangentialMps * 5,
    snapshot.state.latitudeDeg + normalMps * 5,
    Math.max(snapshot.state.altitudeKm + radialMps * 150 + vectorMagnitudeMps * 420, 120) * 1000,
  );
}

function getSnapshotColor(Cesium: CesiumModule, snapshot: SatelliteSnapshot, index: number) {
  return Cesium.Color.fromCssColorString(snapshot.satellite.visual.color ?? palette[index % palette.length]);
}

export function CesiumGlobe({
  snapshots,
  orbitSnapshots,
  rangeMeasurement,
  selectedSatelliteIds,
  showAllOrbits,
  showLabels,
  focusRequest,
  maneuverFocusRequest,
  maneuverSnapshots,
  selectedManeuverId,
  showManeuvers,
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  onSelectConjunction,
  onSelectManeuver,
  onToggleSatellite,
  resetSignal,
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const pathPrimitiveRef = useRef<PrimitiveCollection | null>(null);
  const rangeEntityRef = useRef<Entity | null>(null);
  const rangeLabelEntityRef = useRef<Entity | null>(null);
  const rangeDotEntitiesRef = useRef<Entity[]>([]);
  const maneuverEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const maneuverGeometryEntitiesRef = useRef<Entity[]>([]);
  const conjunctionEntitiesRef = useRef<Entity[]>([]);
  const latestSnapshotsRef = useRef<SatelliteSnapshot[]>(snapshots);
  const hoverInfoRef = useRef<HoverInfo>(null);
  const [layerStats, setLayerStats] = useState({
    orbits: 0,
    trails: 0,
    groundTracks: 0,
  });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    latestSnapshotsRef.current = snapshots;
  }, [snapshots]);

  function zoomCamera(direction: "in" | "out") {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

    const cameraHeight = viewer.camera.positionCartographic.height;
    const amount = Math.max(cameraHeight * 0.38, 250000);

    if (direction === "in") {
      viewer.camera.zoomIn(amount);
    } else {
      viewer.camera.zoomOut(amount);
    }
  }

  function updateHoverInfo(nextHoverInfo: HoverInfo) {
    const previous = hoverInfoRef.current;
    const isSame =
      previous?.name === nextHoverInfo?.name &&
      previous?.noradId === nextHoverInfo?.noradId &&
      previous?.x === nextHoverInfo?.x &&
      previous?.y === nextHoverInfo?.y;

    if (!isSame) {
      hoverInfoRef.current = nextHoverInfo;
      setHoverInfo(nextHoverInfo);
    }
  }

  useEffect(() => {
    let isMounted = true;
    const entityMap = entitiesRef.current;
    const maneuverEntityMap = maneuverEntitiesRef.current;

    async function boot() {
      if (!containerRef.current || viewerRef.current) {
        return;
      }

      window.CESIUM_BASE_URL = "/cesium";
      const Cesium = await import("cesium");

      if (!isMounted || !containerRef.current) {
        return;
      }

      cesiumRef.current = Cesium;
      Cesium.Ion.defaultAccessToken = "";

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Cesium.TileMapServiceImageryProvider.fromUrl(
            Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
          ),
        ),
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: true,
      });

      viewer.scene.backgroundColor = Cesium.Color.BLACK;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1200000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60000000;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          DEFAULT_CAMERA_VIEW.longitudeDeg,
          DEFAULT_CAMERA_VIEW.latitudeDeg,
          DEFAULT_CAMERA_VIEW.heightMeters,
        ),
      });
      pathPrimitiveRef.current = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: import("cesium").ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(movement.position);
        const pickedManeuverId = picked?.id?.properties?.maneuverId?.getValue();
        if (typeof pickedManeuverId === "string") {
          onSelectManeuver(pickedManeuverId);
          return;
        }

        const pickedConjunctionId = picked?.id?.properties?.conjunctionId?.getValue();
        if (typeof pickedConjunctionId === "string") {
          onSelectConjunction(pickedConjunctionId);
          return;
        }

        const pickedId = picked?.id?.properties?.satelliteId?.getValue();
        if (typeof pickedId === "string") {
          onToggleSatellite(pickedId);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((movement: import("cesium").ScreenSpaceEventHandler.MotionEvent) => {
        const picked = viewer.scene.pick(movement.endPosition);
        const pickedEntity = picked?.id;
        const pickedId = pickedEntity?.properties?.satelliteId?.getValue();

        if (typeof pickedId === "string") {
          const x = Math.min(movement.endPosition.x + 14, Math.max(0, viewer.scene.canvas.clientWidth - 190));
          const y = Math.min(movement.endPosition.y + 14, Math.max(0, viewer.scene.canvas.clientHeight - 80));

          updateHoverInfo({
            name: pickedEntity.name ?? "Satellite",
            noradId: pickedId,
            x,
            y,
          });
          viewer.scene.canvas.style.cursor = "pointer";
        } else {
          updateHoverInfo(null);
          viewer.scene.canvas.style.cursor = "grab";
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      viewerRef.current = viewer;
      setViewerReady(true);
    }

    boot();

    return () => {
      isMounted = false;
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      setViewerReady(false);
      rangeEntityRef.current = null;
      rangeLabelEntityRef.current = null;
      rangeDotEntitiesRef.current = [];
      maneuverEntityMap.clear();
      maneuverGeometryEntitiesRef.current = [];
      conjunctionEntitiesRef.current = [];
      pathPrimitiveRef.current = null;
      hoverInfoRef.current = null;
      entityMap.clear();
    };
  }, [onSelectConjunction, onSelectManeuver, onToggleSatellite]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    const activeIds = new Set(snapshots.map((item) => item.satellite.id));

    for (const [id, entity] of entitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        entitiesRef.current.delete(id);
      }
    }
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.state) {
        return;
      }

      const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
      const color = getSnapshotColor(Cesium, snapshot, index);
      const position = stateToCartesian(Cesium, snapshot.state);

      let entity = entitiesRef.current.get(snapshot.satellite.id);

      if (!entity) {
        entity = viewer.entities.add({
          id: snapshot.satellite.id,
          name: snapshot.satellite.name,
          position,
          point: {
            color,
            pixelSize: isSelected ? 15 : 11,
            outlineColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.BLACK,
            outlineWidth: isSelected ? 3 : 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: snapshot.satellite.name,
            font: "700 13px monospace",
            fillColor: color.brighten(0.35, new Cesium.Color()),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            show: showLabels,
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.62),
            backgroundPadding: new Cesium.Cartesian2(8, 5),
            scale: isSelected ? 1.08 : 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 55000000),
          },
          properties: {
            satelliteId: snapshot.satellite.id,
          },
        });
        entitiesRef.current.set(snapshot.satellite.id, entity);
      }

      entity.position = new Cesium.ConstantPositionProperty(position);
      if (entity.point) {
        entity.point.show = new Cesium.ConstantProperty(snapshot.satellite.visual.showMarker);
        entity.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 15 : 11);
        entity.point.color = new Cesium.ConstantProperty(color.withAlpha(isSelected ? 1 : 0.82));
      }
      if (entity.label) {
        entity.label.show = new Cesium.ConstantProperty(
          snapshot.satellite.visual.showLabel && (showLabels || isSelected),
        );
        entity.label.scale = new Cesium.ConstantProperty(isSelected ? 1.08 : 0.95);
      }
    });
  }, [snapshots, selectedSatelliteIds, showLabels, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    const pathPrimitives = pathPrimitiveRef.current;
    if (!pathPrimitives) {
      return;
    }

    // These paths are rebuilt only when the cached trajectory window or layer
    // selection changes. Direct primitives are more predictable for long static
    // polylines than constantly-updated Cesium Entity polyline graphics.
    pathPrimitives.removeAll();

    const visibleOrbitSnapshots = orbitSnapshots.filter((item) => {
      if (!item.satellite.visual.showOrbit) {
        return false;
      }
      return showAllOrbits || selectedSatelliteIds.includes(item.satellite.id);
    });

    visibleOrbitSnapshots.forEach((snapshot, index) => {
      const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
      const color = getSnapshotColor(Cesium, snapshot, index);
      const orbitColor = isSelected ? color : color.withAlpha(0.55);
      const orbitPositions: Cartesian3[] =
        snapshot.futureTrajectory?.map((state) => stateToCartesian(Cesium, state))
        ?? snapshot.trajectory?.map((state) => stateToCartesian(Cesium, state))
        ?? [];

      if (orbitPositions.length < 2) {
        return;
      }

      pathPrimitives.add(new Cesium.PolylineCollection()).add({
        positions: orbitPositions,
        width: isSelected ? 3.2 : 1.5,
        material: Cesium.Material.fromType("Color", {
          color: orbitColor.withAlpha(isSelected ? 0.9 : 0.42),
        }),
      });
    });

    const visibleTrailSnapshots = orbitSnapshots.filter((item) => {
      if (!item.satellite.visual.showTrail) {
        return false;
      }
      return showAllOrbits || selectedSatelliteIds.includes(item.satellite.id);
    });

    visibleTrailSnapshots.forEach((snapshot, index) => {
      const color = getSnapshotColor(Cesium, snapshot, index);
      const trailColor = color.brighten(0.18, new Cesium.Color());
      const trailPositions = snapshot.pastTrail?.map((state) => stateToCartesian(Cesium, state)) ?? [];

      if (trailPositions.length < 2) {
        return;
      }

      pathPrimitives.add(new Cesium.PolylineCollection()).add({
        positions: trailPositions,
        width: 2.4,
        material: Cesium.Material.fromType("PolylineDash", {
          color: trailColor.withAlpha(0.82),
          dashLength: 16,
        }),
      });
    });

    const visibleGroundTrackSnapshots = orbitSnapshots.filter((item) => {
      if (!item.satellite.visual.showGroundTrack) {
        return false;
      }
      return showAllOrbits || selectedSatelliteIds.includes(item.satellite.id);
    });

    visibleGroundTrackSnapshots.forEach((snapshot) => {
      const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
      const groundColor = Cesium.Color.LIME.withAlpha(isSelected ? 0.52 : 0.24);
      const segments = splitGroundTrackByLongitudeWrap(snapshot.groundTrack ?? []);

      segments.forEach((segment) => {
        const sampledSegment = segment.filter((_, pointIndex) => pointIndex % 3 === 0);
        const positions = sampledSegment.length > 1 ? sampledSegment : segment;

        pathPrimitives.add(new Cesium.PolylineCollection()).add({
          positions: positions.map((state) => stateToGroundCartesian(Cesium, state)),
          width: isSelected ? 1.5 : 1,
          material: Cesium.Material.fromType("PolylineDash", {
            color: groundColor,
            dashLength: 18,
          }),
        });
      });
    });

    setLayerStats((current) => {
      const next = {
        orbits: visibleOrbitSnapshots.length,
        trails: visibleTrailSnapshots.length,
        groundTracks: visibleGroundTrackSnapshots.length,
      };

      if (
        current.orbits === next.orbits &&
        current.trails === next.trails &&
        current.groundTracks === next.groundTracks
      ) {
        return current;
      }

      return next;
    });
    viewer.scene.requestRender();
  }, [orbitSnapshots, selectedSatelliteIds, showAllOrbits, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    maneuverGeometryEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    maneuverGeometryEntitiesRef.current = [];

    const activeManeuverIds = new Set(
      showManeuvers ? maneuverSnapshots.map((snapshot) => snapshot.event.id) : [],
    );

    for (const [id, entity] of maneuverEntitiesRef.current) {
      if (!activeManeuverIds.has(id)) {
        viewer.entities.remove(entity);
        maneuverEntitiesRef.current.delete(id);
      }
    }

    if (!showManeuvers) {
      return;
    }

    maneuverSnapshots.forEach((maneuverSnapshot) => {
      if (!maneuverSnapshot.state) {
        return;
      }

      const tone = getManeuverTone(maneuverSnapshot.event.status);
      const color = Cesium.Color.fromCssColorString(tone.color);
      const isSelected = selectedManeuverId === maneuverSnapshot.event.id;
      const position = stateToCartesian(Cesium, maneuverSnapshot.state);
      let entity = maneuverEntitiesRef.current.get(maneuverSnapshot.event.id);

      if (!entity) {
        entity = viewer.entities.add({
          id: maneuverSnapshot.event.id,
          name: maneuverSnapshot.event.title,
          position,
          point: {
            color: color.withAlpha(0.95),
            pixelSize: isSelected ? 17 : 12,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: isSelected ? 3 : 1.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: "MNV",
            font: "800 12px monospace",
            fillColor: color.brighten(0.25, new Cesium.Color()),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -30),
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
            backgroundPadding: new Cesium.Cartesian2(7, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            maneuverId: maneuverSnapshot.event.id,
          },
        });
        maneuverEntitiesRef.current.set(maneuverSnapshot.event.id, entity);
      }

      entity.position = new Cesium.ConstantPositionProperty(position);
      if (entity.point) {
        entity.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 17 : 12);
        entity.point.color = new Cesium.ConstantProperty(color.withAlpha(isSelected ? 1 : 0.82));
      }

      if (isSelected && maneuverSnapshot.event.visual.showBurnVector) {
        const vectorEndpoint = getManeuverVectorEndpoint(Cesium, maneuverSnapshot);
        if (vectorEndpoint) {
          maneuverGeometryEntitiesRef.current.push(viewer.entities.add({
            id: `${maneuverSnapshot.event.id}-burn-vector`,
            name: `${maneuverSnapshot.event.title} burn vector`,
            polyline: {
              positions: [position, vectorEndpoint],
              width: isSelected ? 7 : 4,
              material: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(isSelected ? 0.95 : 0.58)),
              arcType: Cesium.ArcType.NONE,
            },
            properties: {
              maneuverId: maneuverSnapshot.event.id,
            },
          }));
        }
      }
    });
    viewer.scene.requestRender();
  }, [maneuverSnapshots, selectedManeuverId, showManeuvers, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    conjunctionEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    conjunctionEntitiesRef.current = [];

    if (!showConjunctions) {
      return;
    }

    conjunctionSnapshots.forEach((snapshot) => {
      if (!snapshot.primaryState || !snapshot.secondaryState) {
        return;
      }

      const tone = getConjunctionTone(snapshot.status);
      const color = Cesium.Color.fromCssColorString(tone.color);
      const primaryPosition = stateToCartesian(Cesium, snapshot.primaryState);
      const secondaryPosition = stateToCartesian(Cesium, snapshot.secondaryState);
      const midpoint = Cesium.Cartesian3.midpoint(primaryPosition, secondaryPosition, new Cesium.Cartesian3());
      const isSelected = selectedConjunctionId === snapshot.event.id;

      conjunctionEntitiesRef.current.push(viewer.entities.add({
        id: `${snapshot.event.id}-link`,
        name: `${snapshot.primary.name} / ${snapshot.secondary.name} conjunction`,
        polyline: {
          positions: [primaryPosition, secondaryPosition],
          width: isSelected ? 3.8 : 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(isSelected ? 0.96 : 0.58),
            dashLength: 18,
          }),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          conjunctionId: snapshot.event.id,
        },
      }));

      conjunctionEntitiesRef.current.push(viewer.entities.add({
        id: `${snapshot.event.id}-label`,
        name: `${tone.label} conjunction`,
        position: midpoint,
        label: {
          text: `${tone.label} ${snapshot.missDistanceKm.toLocaleString("en", { maximumFractionDigits: 0 })} km`,
          font: "700 12px monospace",
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.76),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          conjunctionId: snapshot.event.id,
        },
      }));
    });

    viewer.scene.requestRender();
  }, [conjunctionSnapshots, selectedConjunctionId, showConjunctions, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    if (!rangeMeasurement?.primary.state || !rangeMeasurement.secondary.state) {
      if (rangeEntityRef.current) {
        viewer.entities.remove(rangeEntityRef.current);
        rangeEntityRef.current = null;
      }
      if (rangeLabelEntityRef.current) {
        viewer.entities.remove(rangeLabelEntityRef.current);
        rangeLabelEntityRef.current = null;
      }
      rangeDotEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      rangeDotEntitiesRef.current = [];
      return;
    }

    const primaryPosition = stateToCartesian(Cesium, rangeMeasurement.primary.state);
    const secondaryPosition = stateToCartesian(Cesium, rangeMeasurement.secondary.state);
    const midpoint = Cesium.Cartesian3.midpoint(primaryPosition, secondaryPosition, new Cesium.Cartesian3());
    const labelText = `${rangeMeasurement.distanceKm.toLocaleString("en", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })} km`;

    if (!rangeEntityRef.current) {
      rangeEntityRef.current = viewer.entities.add({
        id: "range-measurement-line",
        name: "Satellite range measurement",
        polyline: {
          positions: [primaryPosition, secondaryPosition],
          width: 4,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.96),
            dashLength: 26,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }

    if (!rangeLabelEntityRef.current) {
      rangeLabelEntityRef.current = viewer.entities.add({
        id: "range-measurement-label",
        name: "Satellite range distance",
        position: midpoint,
        label: {
          text: labelText,
          font: "600 14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.82),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    if (rangeEntityRef.current.polyline) {
      rangeEntityRef.current.polyline.positions = new Cesium.ConstantProperty([primaryPosition, secondaryPosition]);
      rangeEntityRef.current.polyline.width = new Cesium.ConstantProperty(4);
      rangeEntityRef.current.polyline.material = new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.96),
        dashLength: 26,
      });
    }
    rangeLabelEntityRef.current.position = new Cesium.ConstantPositionProperty(midpoint);
    if (rangeLabelEntityRef.current.label) {
      rangeLabelEntityRef.current.label.text = new Cesium.ConstantProperty(labelText);
    }
  }, [rangeMeasurement, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || !focusRequest) {
      return;
    }

    const snapshot = latestSnapshotsRef.current.find((item) => item.satellite.id === focusRequest.satelliteId);
    if (!snapshot?.state) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        snapshot.state.longitudeDeg,
        snapshot.state.latitudeDeg,
        (snapshot.state.altitudeKm + 2200) * 1000,
      ),
      duration: 0.75,
    });
  }, [focusRequest, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || !maneuverFocusRequest) {
      return;
    }

    const burnPosition = Cesium.Cartesian3.fromDegrees(
      maneuverFocusRequest.longitudeDeg,
      maneuverFocusRequest.latitudeDeg,
      maneuverFocusRequest.altitudeKm * 1000,
    );

    // Frame the burn marker as an object in space instead of placing the camera
    // directly above it. This keeps Earth, the marker, and burn vector visible
    // together when users jump from the maneuver modal.
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(burnPosition, 1000000), {
      offset: new Cesium.HeadingPitchRange(
        viewer.camera.heading,
        Cesium.Math.toRadians(-28),
        7600000,
      ),
      duration: 0.85,
    });
  }, [maneuverFocusRequest, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || resetSignal === 0) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        DEFAULT_CAMERA_VIEW.longitudeDeg,
        DEFAULT_CAMERA_VIEW.latitudeDeg,
        DEFAULT_CAMERA_VIEW.heightMeters,
      ),
      duration: 0.8,
    });
  }, [resetSignal, viewerReady]);

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-md bg-black">
      <div ref={containerRef} className="h-full min-h-[520px] w-full" />
      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-cyan-300/40 bg-black/80 px-3 py-2 text-sm text-white shadow-xl backdrop-blur"
          style={{
            left: hoverInfo.x,
            top: hoverInfo.y,
          }}
        >
          <p className="font-semibold">{hoverInfo.name}</p>
          <p className="font-mono text-xs text-zinc-400">NORAD {hoverInfo.noradId}</p>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 bottom-3 space-y-1 border border-white/10 bg-black/70 px-3 py-2 font-mono text-[11px] text-zinc-300 shadow-xl backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 bg-cyan-200" />
          <span><span className="text-cyan-200">{layerStats.orbits}</span> orbit arc</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 border-t border-dashed border-cyan-100" />
          <span><span className="text-cyan-200">{layerStats.trails}</span> recent trail</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 border-t border-dotted border-lime-300" />
          <span><span className="text-lime-300">{layerStats.groundTracks}</span> ground trace</span>
        </div>
      </div>
      <div className="absolute top-28 left-[420px] z-30 flex overflow-hidden border border-cyan-300/45 bg-black/80 shadow-2xl backdrop-blur max-lg:left-4 max-lg:top-28">
        <button
          type="button"
          onClick={() => zoomCamera("in")}
          className="h-14 w-14 border-r border-cyan-300/25 font-mono text-4xl font-black leading-none text-cyan-100 transition hover:bg-cyan-300/20 hover:text-white"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomCamera("out")}
          className="h-14 w-14 font-mono text-4xl font-black leading-none text-cyan-100 transition hover:bg-cyan-300/20 hover:text-white"
          aria-label="Zoom out"
          title="Zoom out"
        >
          -
        </button>
      </div>
    </div>
  );
}
