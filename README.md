# orbit-visualization-engine

A Phase 3 orbital visualization MVP built with Next.js, TypeScript, CesiumJS, and SatelliteJS.

The app loads TLE data, propagates satellite positions, and renders satellites on a 3D Earth globe. It is intended as the visual foundation for a larger MOSAIC-like space-domain operations interface.

## Deep Architecture Guide

If you want to understand how this project works internally from beginner level to code-owner level, read:

[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md)

That guide explains the complete product purpose, codebase flow, folder structure, CesiumJS rendering, SatelliteJS propagation, ground tracks, maneuvers, conjunctions, UI state flow, performance choices, and interview-style defense answers.

## What This Project Does

- Loads one or many satellites from TLE text or structured JSON config.
- Supports TLE loading from:
  - Built-in sample file: `/data/sample.tle`
  - Built-in JSON config: `/data/satellites.json`
  - External API endpoint URL, for example CelesTrak
  - Local `.tle`, `.txt`, or `.json` file upload
- Parses and validates TLE entries.
- Limits loaded satellites to a maximum of 15.
- Propagates satellite positions using SatelliteJS.
- Renders satellites on a CesiumJS Earth globe.
- Shows satellite labels, selected satellite details, and basic playback controls.
- Toggles individual satellite orbit visibility by clicking satellites on the globe or in the side panel.
- Supports per-satellite marker, label, orbit, trail, and ground-track toggles.
- Renders orbit arcs from propagated Cartesian state, recent past trails, and projected ground tracks.
- Provides a focus control to fly the camera to a selected satellite.
- Shows a 2D ground-track map with an expanded modal and selectable time ranges.
- Calculates current simulation-time distance between two selected satellites.
- Shows maneuver events with burn markers, burn vectors, camera focus, and a modal-first event timeline.
- Shows sample conjunction windows with closest-approach distance, relative velocity, and risk state.
- Keeps propagation logic separate from Cesium rendering logic.

## Tech Stack

- **Next.js 16** with App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **CesiumJS** for 3D Earth visualization
- **SatelliteJS** for TLE/SGP4 propagation

## Local Setup

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

## Available Scripts

Run the dev server:

```bash
npm run dev
```

Run lint checks:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Start the production server after building:

```bash
npm run start
```

## How To Test It Manually

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000`.
3. Confirm the Cesium Earth globe appears.
4. Confirm sample satellites load from `/data/sample.tle`.
5. Click each satellite in the left panel.
6. Confirm clicking a satellite toggles its orbit on/off.
7. Use Play/Pause and speed controls.
8. Toggle satellite labels.
9. Toggle `Show all orbits` and confirm all orbit paths appear.
10. Uncheck `Show all orbits` and confirm only selected satellite orbits appear.
11. Toggle `Trail` and `Ground` for a satellite and confirm those layers render.
12. Click `Focus` for a satellite and confirm the camera flies to it.
13. Click two satellites and confirm `Range check` updates to that pair.
14. Confirm the dotted distance line appears between the two selected satellites.
15. Paste a CelesTrak URL and click `Load`.
16. Load `/data/satellites.json` and confirm metadata/colors/display defaults are applied.

Example endpoint:

```text
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544
```

Expected result: the app loads and displays the ISS TLE.

Example JSON config endpoint:

```text
/data/satellites.json
```

Expected result: the app loads structured satellite objects with visual defaults and metadata.

## Example TLE Data

The built-in sample TLEs live in:

```text
public/data/sample.tle
public/data/satellites.json
src/data/sampleTle.ts
```

Example:

```text
ISS (ZARYA)
1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998
2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554
NOAA 19
1 33591U 09005A   26127.80537625  .00000077  00000+0  74208-4 0  9997
2 33591  99.1938 155.2748 0014341 119.2104 241.0501 14.12516480888880
LANDSAT 8
1 39084U 13008A   26127.83261343  .00001563  00000+0  34857-3 0  9998
2 39084  98.2088 204.2315 0001293  90.7148 269.4201 14.57111222699994
```

## Example JSON Satellite Config

Phase 1 also supports a structured JSON config. This is useful when the app needs satellite metadata and visual defaults instead of plain TLE text.

```json
{
  "satellites": [
    {
      "id": "25544",
      "name": "ISS (ZARYA)",
      "noradId": "25544",
      "sourceType": "TLE",
      "tle": {
        "line1": "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        "line2": "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554"
      },
      "visual": {
        "color": "#63e6be",
        "showMarker": true,
        "showLabel": true,
        "showOrbit": true,
        "showGroundTrack": true,
        "showTrail": true
      },
      "metadata": {
        "owner": "International",
        "mission": "Crewed LEO platform",
        "objectType": "payload"
      }
    }
  ]
}
```

## TLE Endpoint Loading

External TLE URLs are fetched through a Next.js API proxy:

```text
src/app/api/tle/route.ts
```

The browser calls:

```text
/api/tle?url=<encoded-external-url>
```

The server then fetches the external TLE endpoint and returns plain text to the client. This helps avoid browser CORS issues when loading data from sources such as CelesTrak.

Example:

```text
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544
```

## Internal Architecture

High-level flow:

```text
TLE text
  or JSON config
  -> Satellite source parser
  -> Satellite objects
  -> SatelliteJS propagator
  -> StateCacheService
  -> OrbitState snapshots / trajectories
  -> Cesium renderer
  -> Operator UI
```

Important rule:

```text
SatelliteJS computes states.
Cesium only renders states.
```

This separation keeps the visualization layer replaceable. Later, SatelliteJS can be swapped for another propagator or a backend ephemeris service without rewriting the Cesium rendering code.

## Key Folders

```text
src/app/
  Next.js routes and API route handlers

src/components/
  UI and Cesium globe components

src/domain/
  TypeScript domain models, TLE parser, and JSON satellite config parser

src/propagation/
  Propagator interface and SatelliteJS implementation

src/geometry/
  Formatting, distance, and ground-track helpers

src/services/
  State cache and trajectory-window services

src/data/
  Built-in fallback sample TLE text

public/data/
  Browser-accessible sample TLE and JSON config files

public/cesium/
  Cesium static assets copied for local/offline rendering
```

## Important Files

- `src/components/OrbitalDashboard.tsx`  
  Main UI controller for loading data, simulation time, controls, selected satellite state, and panel layout.

- `src/components/CesiumGlobe.tsx`  
  Client-only Cesium renderer for Earth, satellite markers, labels, hover/click behavior, and orbit paths.

- `src/domain/tle.ts`  
  TLE parsing, validation, checksum handling, and max satellite limit enforcement.

- `src/domain/satelliteConfig.ts`  
  Unified satellite source parser for raw TLE text and structured JSON satellite configs.

- `src/propagation/SatelliteJsPropagator.ts`  
  SatelliteJS wrapper that converts TLEs into time-tagged `OrbitState` values.

- `src/services/StateCacheService.ts`  
  Produces current states plus throttled future-orbit, past-trail, and ground-track windows.

- `src/geometry/groundTrack.ts`  
  Splits ground-track segments at longitude wrap boundaries so paths do not jump across the map.

- `src/app/api/tle/route.ts`  
  Server-side TLE endpoint proxy.

## Validation Rules

The TLE parser checks:

- Empty input
- Incomplete TLE entries
- Invalid line 1 / line 2 structure
- Mismatched satellite numbers
- TLE checksum failures
- More than 15 satellite entries

If more than 15 valid TLEs are provided, only the first 15 are loaded and a message is shown.

## Current Phase 3 Scope

Included:

- 3D Earth globe
- TLE loading
- Multiple satellite support
- Basic TLE validation
- Satellite propagation
- Satellite markers and labels
- Orbit visualization
- Click-to-toggle orbit selection for up to 2 satellites
- JSON satellite config loading
- Per-satellite marker, label, orbit, trail, and ground-track toggles
- Cartesian orbit-arc and past-trail visualization
- Ground-track visualization with longitude-wrap handling
- 2D ground-track mini map
- Expanded ground-track modal with selectable history ranges
- Camera focus for individual satellites
- Basic state-cache service for trajectory windows
- Distance/range check between two selected satellites
- Maneuver event model
- Sample planned, candidate, and executed maneuver events
- Maneuver markers on the globe
- Maneuver modal with event timeline, status, delta-v, RTN vector components, burn duration, event time, and selected-event details
- Maneuver burn-vector visualization
- Maneuver pre-burn and post-burn orbit context arcs
- JSON maneuver event loading from `/data/maneuvers.json`
- Conjunction event model
- Closest approach estimation over a sample time window
- Conjunction risk states: safe, warning, critical
- Conjunction range line and TCA label on the globe
- Conjunction panel with miss distance and relative velocity
- Play/pause/time speed controls
- Selected satellite info panel
- Camera reset

Not included yet:

- Mission planning timeline editor
- Ground stations
- Access windows
- Sensor cones
- True post-maneuver orbit propagation from burn physics
- Probability of collision calculation
- CDM ingestion with covariance-based risk assessment
- Operator ephemeris ingestion, such as CCSDS OEM/SP3
- High-fidelity backend propagator with force models
- Orbit-determination workflow from tracking measurements
- Authentication
- Database persistence
- Real command/control features

## Accuracy Notes

This project is currently a visualization MVP, not an authoritative flight-dynamics system.

Current behavior:

- TLEs are propagated with SatelliteJS/SGP4.
- Orbit arcs and trails are sampled from propagated Cartesian states; ground tracks are sampled from latitude/longitude surface projection.
- Maneuvers are sample event markers with visual burn vectors.
- Conjunctions are sample close-approach windows computed from available propagated states.

This is useful for:

- Learning orbital visualization concepts
- Building operator-style UI workflows
- Inspecting TLE-driven satellite motion
- Prototyping mission-analysis screens

This is not enough for:

- Operational collision avoidance
- Certified maneuver planning
- Probability-of-collision decisions
- High-precision orbit determination
- Command/control of real spacecraft

## Production-Grade Orbital Analysis Roadmap

To make this scientifically stronger, move the authoritative astrodynamics work out of the browser and into a backend analysis service. The browser should remain a visualization client.

Recommended architecture:

```text
Authoritative data sources
  -> Backend ingestion jobs
  -> Orbit / event database
  -> High-fidelity propagation service
  -> Conjunction and maneuver analysis service
  -> API snapshots / ephemeris tiles
  -> Cesium visualization client
```

### 1. Use Better Data Products

For public catalog objects, continue supporting TLE/GP data, but prefer modern OMM/GP formats where possible.

Useful sources:

- CelesTrak GP/OMM data for public satellite catalogs:

```text
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle
https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json
https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv
```

- Space-Track GP and CDM data. Space-Track requires an account and has API rate limits:

```text
https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/>now-10/orderby/norad_cat_id/format/tle
https://www.space-track.org/basicspacedata/query/class/cdm_public/format/json
```

- CCSDS CDM, the standard message format for conjunction reports.
- CCSDS OEM, a better format than TLE when an operator can provide time-tagged ephemeris.
- NASA/JPL SPICE or Horizons for planetary/deep-space ephemerides, not normal Earth satellite catalog tracking.
- NASA CDDIS/IGS SP3 precise orbit products for GNSS-style precise orbit files.

### 2. Add Backend Propagation

Keep SatelliteJS for browser demos, but add a backend propagator for analysis.

Good options:

- Orekit for high-fidelity propagation, frames, time systems, measurements, and orbit determination.
- NASA GMAT for mission analysis, maneuver planning, and validation workflows.
- SPICE/Horizons for planetary and deep-space mission geometry.

Backend propagation should support:

- UTC/TAI/TT time handling
- Earth orientation parameters
- TEME, GCRF/ECI, ITRF/ECEF, and geodetic conversions
- Higher-order gravity
- Atmospheric drag
- Solar radiation pressure
- Third-body perturbations from Sun/Moon
- Maneuver impulse or finite-burn models

### 3. Upgrade Conjunction Analysis

Current conjunctions are visual sample events. Production-grade conjunction analysis should ingest or compute:

- Time of closest approach, also called TCA
- Miss distance
- Relative velocity
- Radial/in-track/cross-track separation
- Covariance matrices
- Probability of collision
- Screening thresholds
- Risk status history over time

Use CDM records when possible. A CDM already carries close-approach metadata and covariance information from an authoritative source.

### 4. Upgrade Maneuver Modeling

Current maneuver markers are sample events. Production-grade maneuver support should include:

- Planned, candidate, cancelled, and executed maneuver statuses
- Delta-v vector in a clear frame, such as RTN
- Impulsive and finite-burn modeling
- Pre-maneuver and post-maneuver propagated trajectories
- Maneuver uncertainty
- Collision-screening before and after the maneuver
- Audit log of planning assumptions

### 5. Add Validation

Do not trust visuals alone. Add validation against trusted tools and data:

- Compare propagated states against Orekit/GMAT/STK-style reference runs.
- Compare TLE-derived states against known CelesTrak/Space-Track outputs.
- Validate ground tracks against known passes.
- Validate CDM parsing with official CCSDS examples.
- Record max position error, velocity error, and frame-conversion error.

### 6. Store Time-Series Data

For larger scenarios, precompute and cache ephemeris data instead of recalculating everything in the browser.

Recommended stored objects:

- Satellite catalog metadata
- Raw TLE/OMM history
- OEM/SP3 ephemeris files
- Propagated state vectors
- Ground-track samples
- Maneuver events
- Conjunction events/CDMs
- User scenario timelines

The frontend can then request time-windowed state slices instead of doing all analysis locally.

## Notes

- `satellite.js` is pinned to `5.0.0` because newer versions can pull WASM/Node worker modules into the browser bundle.
- `npm run dev` and `npm run build` use Webpack mode for more predictable Cesium/SatelliteJS bundling.
- Cesium static assets are copied into `public/cesium` so the globe can render local Natural Earth imagery without requiring a Cesium Ion token.
