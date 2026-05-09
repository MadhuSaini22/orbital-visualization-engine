# orbit-visualization-engine

A Phase 0 orbital visualization MVP built with Next.js, TypeScript, CesiumJS, and SatelliteJS.

The app loads TLE data, propagates satellite positions, and renders satellites on a 3D Earth globe. It is intended as the visual foundation for a larger MOSAIC-like space-domain operations interface.

## What This Project Does

- Loads one or many satellites from TLE text.
- Supports TLE loading from:
  - Built-in sample file: `/data/sample.tle`
  - External API endpoint URL, for example CelesTrak
  - Local `.tle` or `.txt` file upload
- Parses and validates TLE entries.
- Limits loaded satellites to a maximum of 15.
- Propagates satellite positions using SatelliteJS.
- Renders satellites on a CesiumJS Earth globe.
- Shows satellite labels, selected satellite details, and basic playback controls.
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
6. Confirm the selected satellite details update.
7. Use Play/Pause and speed controls.
8. Toggle satellite labels.
9. Toggle `Show all orbits`.
10. Paste a CelesTrak URL and click `Load`.

Example endpoint:

```text
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544
```

Expected result: the app loads and displays the ISS TLE.

## Example TLE Data

The built-in sample TLEs live in:

```text
public/data/sample.tle
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
  -> TLE parser
  -> Satellite objects
  -> SatelliteJS propagator
  -> OrbitState snapshots
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
  TypeScript domain models and TLE parser

src/propagation/
  Propagator interface and SatelliteJS implementation

src/geometry/
  Formatting and geometry-related helpers

src/data/
  Built-in fallback sample TLE text

public/data/
  Browser-accessible sample TLE file

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

- `src/propagation/SatelliteJsPropagator.ts`  
  SatelliteJS wrapper that converts TLEs into time-tagged `OrbitState` values.

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

## Current Phase 0 Scope

Included:

- 3D Earth globe
- TLE loading
- Multiple satellite support
- Basic TLE validation
- Satellite propagation
- Satellite markers and labels
- Orbit visualization
- Play/pause/time speed controls
- Selected satellite info panel
- Camera reset

Not included yet:

- Maneuver markers
- Ground tracks
- Conjunction analysis
- Mission event timeline
- Ground stations
- Access windows
- Sensor cones
- Authentication
- Database persistence
- Real command/control features

## Notes

- `satellite.js` is pinned to `5.0.0` because newer versions can pull WASM/Node worker modules into the browser bundle.
- `npm run dev` and `npm run build` use Webpack mode for more predictable Cesium/SatelliteJS bundling.
- Cesium static assets are copied into `public/cesium` so the globe can render local Natural Earth imagery without requiring a Cesium Ion token.
