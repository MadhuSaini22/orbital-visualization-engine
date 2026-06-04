# Orbit Visualization Engine

Command-center orbital operations and mission-planning workspace built with Next.js, CesiumJS, SatelliteJS, Spring Boot, and Orekit.

The product model is:

```text
Orbit -> Propagation Profile -> Mission -> Mission Profile Snapshot -> Timeline Events -> Trajectory Products -> Cesium Visualization
```

The main screen is for situational awareness. Planning, analysis, workspace management, and reusable templates live in dedicated command modals.

## Architecture Overview

```mermaid
flowchart LR
  Operator[Operator] --> UI[Command Center UI]
  UI --> OrbitSource[Orbit Source]
  UI --> MissionPlanner[Mission Planner Modal]
  UI --> Analysis[Analysis Modal]
  UI --> Workspace[Workspace Modal]
  UI --> Templates[Templates Modal]

  OrbitSource --> Catalog[Catalog TLE]
  OrbitSource --> ImportedTle[Imported TLE]
  OrbitSource --> ManualOrbit[Manual Cartesian / Classical]
  OrbitSource --> OrbitTemplate[Orbit Template]

  OrbitSource --> SourceProfile[Orbit Propagation Profile]
  MissionPlanner --> Mission[Mission]
  SourceProfile --> MissionProfile[Mission Profile Snapshot]
  Mission --> MissionProfile
  Mission --> Timeline[Mission Timeline]
  Timeline --> Events[Coast / Finite Burn Events]
  Events --> TrajectoryRequest[Mission Trajectory Request]

  TrajectoryRequest --> Backend[Spring / Orekit Backend]
  Backend --> Samples[Trajectory Samples]
  Samples --> Cesium[Cesium Globe]
  Analysis --> Samples
```

## Frontend Architecture

```mermaid
flowchart TB
  App[Next.js App Router] --> Dashboard[OrbitalDashboard.tsx]
  Dashboard --> CesiumGlobe[CesiumGlobe.tsx]
  Dashboard --> CommandCenter[Main Command Center]
  Dashboard --> Modals[Command Modals]

  CommandCenter --> OrbitSummary[Orbit Summary Card]
  CommandCenter --> MissionSummary[Mission Summary Card]
  CommandCenter --> SatelliteFilter[Satellite Selection]
  CommandCenter --> SimControls[Simulation Controls]
  CommandCenter --> StatusBadges[Status Badges]

  Modals --> MissionPlanner[Mission Planner]
  Modals --> AnalysisModal[Analysis]
  Modals --> WorkspaceModal[Workspace]
  Modals --> TemplateModal[Templates]

  MissionPlanner --> MissionSetup[Mission Setup]
  MissionPlanner --> TimelineCards[Timeline Event Cards]
  MissionPlanner --> VisualTimeline[Visual Mission Timeline]
  MissionPlanner --> EventModal[Event Editor]

  WorkspaceModal --> OrbitLibrary[Orbit Library]
  WorkspaceModal --> MissionLibrary[Mission Library]
  TemplateModal --> OrbitTemplates[Orbit Templates]
  TemplateModal --> MissionTemplates[Mission Templates]

  Dashboard --> ApiClient[orbitServerApi.ts]
  Dashboard --> LocalStorage[workspaceStorage.ts]
```

## Backend Architecture

```mermaid
flowchart TB
  Controllers[Spring Controllers] --> Services[Service Layer]
  Services --> Repositories[Repositories]
  Repositories --> Database[(Postgres / Schema SQL)]

  Controllers --> OrbitApi[OrbitController]
  Controllers --> ManualOrbitApi[ManualOrbitController]
  Controllers --> MissionApi[MissionController]
  Controllers --> ManeuverApi[ManeuverController]

  Services --> OrbitAnalysis[OrekitOrbitAnalysisService]
  Services --> ManualOrbit[ManualOrbitService]
  Services --> MissionService[MissionService]
  Services --> TimelineService[MissionTimelineService]
  Services --> MissionTrajectory[MissionTrajectoryService]

  MissionTrajectory --> TimelinePropagation[MissionTimelinePropagationService]
  TimelinePropagation --> TimelineExecutor[TimelineExecutor]
  TimelineExecutor --> Commands[PropagationManeuverCommand]

  Services --> ProfileService[PropagationProfileService]
  ProfileService --> Profiles[(propagation_profiles)]
  ProfileService --> LegacyConfig[(satellite_analysis_configs)]

  MissionTrajectory --> ContextFactory[MissionPropagationContextFactory]
  MissionTrajectory --> ProfileService
  ContextFactory --> PropagationContext[PropagationContext]
  PropagationContext --> Numerical[NumericalPropagator]
  Numerical --> OrekitFactory[OrekitManeuverFactory]
  Numerical --> Ephemeris[EphemerisGenerator / BoundedPropagator]
```

## Propagation Profile Lifecycle

```mermaid
flowchart TB
  CreateOrbit[Create / Load Orbit Source]
  Catalog[Catalog NORAD]
  Manual[Imported TLE / Classical / Cartesian]
  SatelliteConfig[satellite_analysis_configs]
  OrbitProfile[propagation_profiles owner=SATELLITE or MANUAL_ORBIT]
  Mission[Create Mission]
  MissionProfile[propagation_profiles owner=MISSION]
  AnalysisTab[Analysis -> Propagation Tab]
  Trajectory[Mission Trajectory Generation]

  CreateOrbit --> Catalog
  CreateOrbit --> Manual
  Catalog --> SatelliteConfig
  SatelliteConfig --> OrbitProfile
  Manual --> OrbitProfile
  OrbitProfile --> Mission
  Mission --> MissionProfile
  MissionProfile --> AnalysisTab
  MissionProfile --> Trajectory
```

Every backend mission uses a mission-scoped propagation profile snapshot. Orbit-source configuration and mission execution configuration are intentionally separate so one orbit can support multiple missions with different force-model settings.

## Database Ownership Model

```mermaid
erDiagram
  SATELLITES ||--o| PROPAGATION_PROFILES : "SATELLITE owner_id"
  MANUAL_ORBITS ||--o| PROPAGATION_PROFILES : "MANUAL_ORBIT owner_id"
  MISSIONS ||--o| PROPAGATION_PROFILES : "MISSION owner_id"
  MISSIONS ||--o{ MISSION_TIMELINE_EVENTS : contains
  SATELLITE_ANALYSIS_CONFIGS ||--o| PROPAGATION_PROFILES : "legacy sync"

  PROPAGATION_PROFILES {
    text id PK
    text owner_type
    text owner_id
    text propagator_type
    boolean gravity_enabled
    boolean drag_enabled
    boolean solar_radiation_pressure_enabled
    boolean third_body_sun_enabled
    boolean third_body_moon_enabled
    boolean maneuver_model_enabled
    double dry_mass_kg
    double fuel_mass_kg
    double integrator_min_step
    double integrator_max_step
  }
```

## Mission Planning Sequence

```mermaid
sequenceDiagram
  actor User
  participant UI as Mission Planner
  participant API as Mission API
  participant Store as Workspace Storage

  User->>UI: Create or load orbit
  UI->>API: Persist backend orbit if manual/imported
  API-->>UI: subjectNoradId or subjectOrbitId
  User->>UI: Create Mission
  UI->>API: POST /api/missions
  API->>API: Copy orbit profile into mission profile
  API-->>UI: Mission
  UI->>API: GET /api/missions/{id}/propagation-profile
  API-->>UI: Mission propagation profile
  UI->>Store: Remember active mission
  User->>UI: Add Coast / Finite Burn
  UI->>API: POST /api/missions/{id}/timeline/events
  API-->>UI: Timeline event
  UI->>UI: Update visual timeline
```

## Trajectory Generation Sequence

```mermaid
sequenceDiagram
  actor User
  participant UI as Mission Planner
  participant API as MissionController
  participant Service as MissionTrajectoryService
  participant Executor as TimelineExecutor
  participant Orekit as NumericalPropagator / Orekit

  User->>UI: Generate Trajectory
  UI->>API: POST /api/missions/{missionId}/trajectory
  API->>Service: trajectory(missionId, request)
  Service->>Executor: timeline events -> commands
  Executor-->>Service: PropagationManeuverCommand[]
  Service->>Service: Load mission propagation profile
  Service->>Service: Reject finite burns if maneuver model is disabled
  Service->>Service: Build mission-scoped PropagationContext
  Service->>Orekit: trajectory(context, start, end, step)
  Orekit-->>Service: Ephemeris samples
  Service-->>API: states
  API-->>UI: PropagationResponse
  UI->>UI: Store overlay and close Mission Planner
```

## Data Flow Diagram

```mermaid
flowchart LR
  TLE[TLE / Manual State / Template] --> OrbitObject[Frontend Orbit Object]
  OrbitObject --> BackendOrbit[Backend Manual Orbit or Catalog NORAD]
  BackendOrbit --> OrbitProfile[Orbit Propagation Profile]
  OrbitProfile --> Mission[Mission Subject]
  Mission --> MissionProfile[Mission Profile Snapshot]

  Mission --> TimelineEvents[Timeline Events]
  TimelineEvents --> Scheduling[UTC / MET / AFTER_EVENT Metadata]
  Scheduling --> ExecutionTime[UTC executionTime]
  ExecutionTime --> BackendTimeline[Backend Timeline Event]

  MissionProfile --> PropagationContext[PropagationContext]
  BackendTimeline --> TimelineExecutor[TimelineExecutor]
  TimelineExecutor --> Commands[Propagation Commands]
  Commands --> PropagationContext
  PropagationContext --> Numerical[NumericalPropagator]
  Numerical --> Samples[Trajectory Samples]
  Samples --> OrbitSnapshots[Frontend Orbit Snapshots]
  OrbitSnapshots --> Cesium[Cesium Renderer]
```

## Command Center Screens

| Area | Purpose | Notes |
| --- | --- | --- |
| Main Screen | Situational awareness | Earth visualization, selected orbit, active mission, status badges, simulation controls |
| Mission Planner | Mission design | Mission setup, event creation, visual timeline, scheduling, trajectory generation |
| Analysis | Inspection | Trajectory overlay, range, conjunction status, maneuver summaries, propagation config |
| Workspace | Asset management | Orbit and mission libraries, import/export, clone, rename, delete |
| Templates | Reuse | Orbit templates, mission templates, import/export, metadata |

## Feature Matrix

| Feature | Status | Storage / API | Notes |
| --- | --- | --- | --- |
| Catalog TLE orbit | Available | Backend catalog / NORAD | Supports backend mission subject via `subjectNoradId` |
| Imported TLE orbit | Available | Backend manual orbit | Persisted as manual `TLE` orbit for `subjectOrbitId` mission planning |
| Classical elements orbit | Available | Backend manual orbit | Mission subject uses `subjectOrbitId` |
| Cartesian state orbit | Available | Backend manual orbit | Mission subject uses `subjectOrbitId` |
| Orbit library | Available | `localStorage` | `orbit-library-v1` |
| Mission library | Available | `localStorage` | `mission-library-v1` |
| Orbit templates | Available | `localStorage` | `orbit-template-library-v1` |
| Mission templates | Available | `localStorage` | `mission-template-library-v1` |
| COAST events | Available | Backend timeline | Propagation no-op |
| FINITE_BURN events | Available | Backend timeline | Existing finite burn bridge; no new physics |
| UTC scheduling | Available | Backend `executionTime` | Backend execution remains UTC |
| MET scheduling | Available | Event metadata + computed UTC | Planning layer only |
| After Event scheduling | Available | Event metadata + computed UTC | Planning layer only |
| Visual timeline | Available | Frontend planning layer | Draggable scheduling surface |
| Mission trajectory | Available | `POST /api/missions/{id}/trajectory` | Uses existing numerical propagation |
| Propagation profiles | Available | Backend `propagation_profiles` | Source-independent profiles for catalog, imported TLE, classical, Cartesian, and missions |
| Propagation config tab | Available | Mission profile API | Shows the exact mission profile used by generated trajectories |
| Conjunction sync | Not implemented | Disabled UI | Marked `Coming Soon` |
| Impulsive burns | Not implemented | N/A | Future phase |
| Vector burns | Not implemented | N/A | Future phase |

## State Management

Most state is intentionally local to `OrbitalDashboard.tsx` because the app is currently a single command-center workspace.

State groups:

- orbit source state: active source, selected satellite, manual orbit id.
- simulation state: simulation time, playback speed, frame mode.
- mission state: active mission, timeline events, selected event, mission trajectory overlay.
- scheduling state: UTC/MET mode, dependency metadata, visual timeline drag state.
- analysis state: range pair, conjunction visibility, maneuver visibility, legacy catalog analysis config, mission propagation profile.
- workspace state: orbit library, mission library, templates, import/export refs.

Persistent local state is handled by `src/services/workspaceStorage.ts`.

Backend API calls are centralized in `src/services/orbitServerApi.ts`.

## Folder Structure

```text
src/
  app/
    layout.tsx
    page.tsx
    api/tle/route.ts

  components/
    OrbitalDashboard.tsx
    CesiumGlobe.tsx

  geometry/
    orbitalMath.ts
    utcDateTime.js

  services/
    orbitServerApi.ts
    workspaceStorage.ts

server/
  src/main/java/com/orbitvisualizationengine/server/
    api/
      MissionController.java
      ManualOrbitController.java
      OrbitController.java

    domain/
      Mission.java
      MissionTimelineEvent.java
      ManualOrbitRecord.java
      PropagationProfile.java

    dto/
      MissionTrajectoryRequest.java
      CreateMissionRequest.java
      CreateTimelineEventRequest.java
      PropagationProfileResponse.java

    propagation/
      NumericalPropagator.java
      OrekitManeuverFactory.java
      PropagationContext.java

    repository/
      MissionRepository.java
      MissionTimelineEventRepository.java
      ManualOrbitRepository.java
      PropagationProfileRepository.java

    service/
      MissionTrajectoryService.java
      MissionTimelineService.java
      TimelineExecutor.java
      ManualOrbitService.java
      PropagationProfileService.java

  src/main/resources/db/
    schema.sql

audit/
  architecture and validation reports
```

## Important Boundaries

Do not casually modify these when working on UI/workspace features:

- `server/src/main/java/.../propagation/NumericalPropagator.java`
- `server/src/main/java/.../propagation/OrekitManeuverFactory.java`
- `server/src/main/java/.../service/TimelineExecutor.java`
- trajectory sampling logic.
- Orekit force-model math.
- backend UTC execution semantics.

Planning-layer UX can change independently as long as it continues producing backend-compatible UTC `executionTime` values.

## Running Locally

Install frontend dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the backend:

```bash
cd server
mvn spring-boot:run
```

Open:

```text
http://localhost:3000
```

## Verification Commands

Frontend lint:

```bash
npm run lint
```

Frontend production build:

```bash
npm run build
```

Backend tests:

```bash
cd server
mvn test
```

## Deployment Notes

Frontend:

- Next.js app can be deployed as a standard Node/Next deployment.
- The `/api/tle` route proxies external TLE URLs to avoid browser CORS issues.

Backend:

- Spring Boot service requires database connectivity and Orekit data availability.
- Schema initialization is defined in `server/src/main/resources/db/schema.sql`.
- Mission trajectory generation requires the backend service to be reachable from the frontend API client configuration.
- Existing `satellite_analysis_configs` rows are synced into `propagation_profiles` for catalog compatibility.
- Manual/imported orbit profiles are generated on orbit creation and lazily for older persisted manual orbit records.
- Mission creation snapshots the source profile into an owner=`MISSION` profile used by trajectory generation.

## Developer Onboarding Checklist

1. Read this README.
2. Skim `audit/command-center-ui-rearchitecture-report.md`.
3. Open `src/components/OrbitalDashboard.tsx` and identify the command modal sections.
4. Open `src/services/orbitServerApi.ts` and map frontend calls to backend endpoints.
5. Open `server/src/main/java/.../MissionTrajectoryService.java`.
6. Confirm mission trajectory flow reaches `NumericalPropagator` without frontend physics manipulation.
7. Run `npm run lint`.
8. Run `npm run build`.
