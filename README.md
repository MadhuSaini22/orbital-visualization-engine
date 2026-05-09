# MOSAIC Phase 0 Orbital Viewer

A small Next.js + TypeScript + Tailwind app for the Phase 0 orbital visualization MVP.

## Features

- Cesium Earth globe
- Load TLE data from `/public/data/sample.tle`, a URL, or a local `.tle` / `.txt` file
- Parse one or many TLE entries
- Enforce a maximum of 15 TLE objects
- Show clear messages for invalid TLEs, checksum failures, empty files, and over-limit files
- Propagate satellite positions with SatelliteJS
- Render one moving marker per satellite
- Render orbit arcs around Earth
- Use local Cesium Natural Earth imagery, so the globe works without an Ion token
- Toggle satellite labels
- Hover or click a satellite marker to identify it
- Play, pause, reset current time, and change simulation speed
- Reset camera view
- Select a satellite and inspect latitude, longitude, altitude, velocity, and frame

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Build

```bash
npm run build
```

## Architecture

```text
TLE text -> TLE parser -> SatelliteJS propagator -> OrbitState snapshots -> Cesium renderer -> UI panels
```

The renderer only displays propagated states. SatelliteJS stays inside the propagation layer so it can be replaced later.
