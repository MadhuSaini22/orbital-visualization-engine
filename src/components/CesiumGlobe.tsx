"use client";

import { useEffect, useRef, useState } from "react";
import type { OrbitState, RangeMeasurement, SatelliteSnapshot } from "@/domain/orbit";

type CesiumModule = typeof import("cesium");
type Viewer = import("cesium").Viewer;
type Entity = import("cesium").Entity;
type Cartesian3 = import("cesium").Cartesian3;

type CesiumGlobeProps = {
  snapshots: SatelliteSnapshot[];
  orbitSnapshots: SatelliteSnapshot[];
  rangeMeasurement: RangeMeasurement | null;
  selectedSatelliteIds: string[];
  showAllOrbits: boolean;
  showLabels: boolean;
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

type HoverInfo = {
  name: string;
  noradId: string;
  x: number;
  y: number;
} | null;

function stateToCartesian(Cesium: CesiumModule, state: OrbitState): Cartesian3 {
  if (state.positionEciKm) {
    return new Cesium.Cartesian3(
      state.positionEciKm[0] * 1000,
      state.positionEciKm[1] * 1000,
      state.positionEciKm[2] * 1000,
    );
  }

  if (state.positionEcefKm) {
    return new Cesium.Cartesian3(
      state.positionEcefKm[0] * 1000,
      state.positionEcefKm[1] * 1000,
      state.positionEcefKm[2] * 1000,
    );
  }

  return Cesium.Cartesian3.fromDegrees(
    state.longitudeDeg,
    state.latitudeDeg,
    state.altitudeKm * 1000,
  );
}

export function CesiumGlobe({
  snapshots,
  orbitSnapshots,
  rangeMeasurement,
  selectedSatelliteIds,
  showAllOrbits,
  showLabels,
  onToggleSatellite,
  resetSignal,
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const orbitEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const rangeEntityRef = useRef<Entity | null>(null);
  const rangeLabelEntityRef = useRef<Entity | null>(null);
  const rangeDotEntitiesRef = useRef<Entity[]>([]);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const entityMap = entitiesRef.current;
    const orbitEntityMap = orbitEntitiesRef.current;

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
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1200000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60000000;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(78, 20, 15000000),
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: import("cesium").ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(movement.position);
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

          setHoverInfo({
            name: pickedEntity.name ?? "Satellite",
            noradId: pickedId,
            x,
            y,
          });
          viewer.scene.canvas.style.cursor = "pointer";
        } else {
          setHoverInfo(null);
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
      entityMap.clear();
      orbitEntityMap.clear();
    };
  }, [onToggleSatellite]);

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
      const color = Cesium.Color.fromCssColorString(palette[index % palette.length]);
      const position = stateToCartesian(Cesium, snapshot.state);

      let entity = entitiesRef.current.get(snapshot.satellite.id);

      if (!entity) {
        entity = viewer.entities.add({
          id: snapshot.satellite.id,
          name: snapshot.satellite.name,
          position,
          point: {
            color,
            pixelSize: isSelected ? 18 : 14,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: snapshot.satellite.name,
            font: "600 15px sans-serif",
            fillColor: Cesium.Color.WHITE,
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
        entity.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 18 : 14);
        entity.point.color = new Cesium.ConstantProperty(color.withAlpha(isSelected ? 1 : 0.82));
      }
      if (entity.label) {
        entity.label.show = new Cesium.ConstantProperty(showLabels || isSelected);
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

    const visibleOrbitSnapshots = showAllOrbits
      ? orbitSnapshots
      : orbitSnapshots.filter((item) => selectedSatelliteIds.includes(item.satellite.id));
    const activeIds = new Set(visibleOrbitSnapshots.map((item) => item.satellite.id));
    for (const [id, entity] of orbitEntitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        orbitEntitiesRef.current.delete(id);
      }
    }

    visibleOrbitSnapshots.forEach((snapshot, index) => {
      const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
      const color = Cesium.Color.fromCssColorString(palette[index % palette.length]);
      const orbitColor = isSelected ? color : color.withAlpha(0.55);
      const orbitPositions: Cartesian3[] =
        snapshot.trajectory?.map((state) => stateToCartesian(Cesium, state)) ?? [];

      if (orbitPositions.length < 2) {
        return;
      }

      let orbitEntity = orbitEntitiesRef.current.get(snapshot.satellite.id);
      if (!orbitEntity) {
        orbitEntity = viewer.entities.add({
          id: `${snapshot.satellite.id}-orbit`,
          name: `${snapshot.satellite.name} full orbit`,
          polyline: {
            positions: orbitPositions,
            width: isSelected ? 6 : 3,
            material: orbitColor,
            depthFailMaterial: color.withAlpha(isSelected ? 0.95 : 0.45),
            arcType: Cesium.ArcType.NONE,
          },
        });
        orbitEntitiesRef.current.set(snapshot.satellite.id, orbitEntity);
      }

      if (orbitEntity.polyline) {
        orbitEntity.polyline.positions = new Cesium.ConstantProperty(orbitPositions);
        orbitEntity.polyline.width = new Cesium.ConstantProperty(isSelected ? 6 : 3);
        orbitEntity.polyline.material = new Cesium.ColorMaterialProperty(orbitColor);
        orbitEntity.polyline.depthFailMaterial = new Cesium.ColorMaterialProperty(
          color.withAlpha(isSelected ? 0.95 : 0.45),
        );
      }
    });
  }, [orbitSnapshots, selectedSatelliteIds, showAllOrbits, viewerReady]);

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
    const dotPositions = Array.from({ length: 19 }, (_, index) =>
      Cesium.Cartesian3.lerp(
        primaryPosition,
        secondaryPosition,
        index / 18,
        new Cesium.Cartesian3(),
      ),
    );
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
          width: 5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.MAGENTA.withAlpha(0.98),
            dashLength: 20,
          }),
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.CYAN.withAlpha(0.95),
            dashLength: 20,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }

    if (rangeDotEntitiesRef.current.length !== dotPositions.length) {
      rangeDotEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      rangeDotEntitiesRef.current = dotPositions.map((position, index) =>
        viewer.entities.add({
          id: `range-measurement-dot-${index}`,
          name: "Satellite range measurement dot",
          position,
          point: {
            color: index === 0 || index === dotPositions.length - 1
              ? Cesium.Color.WHITE.withAlpha(1)
              : Cesium.Color.MAGENTA.withAlpha(0.95),
            pixelSize: index === 0 || index === dotPositions.length - 1 ? 8 : 5,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
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
      rangeEntityRef.current.polyline.width = new Cesium.ConstantProperty(5);
    }
    rangeDotEntitiesRef.current.forEach((entity, index) => {
      entity.position = new Cesium.ConstantPositionProperty(dotPositions[index]);
    });
    rangeLabelEntityRef.current.position = new Cesium.ConstantPositionProperty(midpoint);
    if (rangeLabelEntityRef.current.label) {
      rangeLabelEntityRef.current.label.text = new Cesium.ConstantProperty(labelText);
    }
  }, [rangeMeasurement, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || resetSignal === 0) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(78, 20, 15000000),
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
    </div>
  );
}
