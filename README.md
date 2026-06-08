# Orbit Visualization Engine

Command-center orbital operations and mission-planning workspace built with Next.js, CesiumJS, SatelliteJS, Spring Boot, and Orekit.

The product model is:

```text
Orbit -> Propagation Profile -> Mission -> Mission Profile Snapshot -> Timeline Events -> Trajectory Products -> Cesium Visualization
```

The main screen is for situational awareness. Planning, analysis, workspace management, and reusable templates live in dedicated command modals.

## Screenshots

### Orbit Source Selection

![Orbit Source Selection](https://github.com/user-attachments/assets/f4e90259-1aa2-4fc4-a45c-7a87c1528079)

Create spacecraft orbits using TLE catalogs, imported TLEs, orbital elements, Cartesian states, or reusable templates.

---

### TLE Import Workflow

![TLE Import](https://github.com/user-attachments/assets/888de5c3-20ba-4cb2-8539-9810110a7a5d)

Import one or more spacecraft from raw TLE data with validation, preview, and mission-ready initialization.

---

### Mission Planning & Timeline Design

![Mission Planner](https://github.com/user-attachments/assets/8135062d-d285-40e5-aa34-35fb2f9cdc2b)

Configure propagation settings, force models, finite burns, coast phases, and mission timelines before trajectory generation.

---

### Operational Visualization

![Operational Visualization](https://github.com/user-attachments/assets/10e655c8-0429-426e-b276-9d2b5e28366d)

Visualize satellite trajectories in 3D, monitor mission status, and analyze generated mission plans in real time.


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
    text integrator_type
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
  alt Imported multi-TLE
    UI->>UI: Show all imported objects
    User->>UI: Select exactly one Mission Spacecraft
    UI->>API: POST /api/manual-orbits for selected TLE only
    API-->>UI: subjectOrbitId
  else Catalog or manual state
    UI->>API: Persist backend orbit if manual/imported
    API-->>UI: subjectNoradId or subjectOrbitId
  end
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
  participant Prop as Selected Propagator / Orekit

  User->>UI: Generate Trajectory
  UI->>API: POST /api/missions/{missionId}/trajectory
  API->>Service: trajectory(missionId, request)
  Service->>Executor: timeline events -> commands
  Executor-->>Service: PropagationManeuverCommand[]
  Service->>Service: Load mission propagation profile
  Service->>Service: Select NUMERICAL / KEPLERIAN / TLE_SGP4 from profile
  Service->>Service: Reject finite burns unless selected propagator supports maneuvers
  Service->>Service: Build mission-scoped PropagationContext
  Service->>Prop: trajectory(context, start, end, step)
  Prop-->>Service: Ephemeris samples + model name
  Service-->>API: states
  API-->>UI: PropagationResponse
  UI->>UI: Store overlay and close Mission Planner
```

## Data Flow Diagram

```mermaid
flowchart LR
  TLE[TLE / Manual State / Template] --> OrbitObject[Frontend Orbit Object]
  OrbitObject --> SpacecraftChoice[Mission Spacecraft Selection]
  SpacecraftChoice --> BackendOrbit[Backend Manual Orbit or Catalog NORAD]
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


## Mission Spacecraft Rule

Imported TLE files may contain multiple spacecraft. The application treats those objects as visualization and analysis objects until the operator chooses exactly one `Mission Spacecraft`.

Only the Mission Spacecraft receives:

- mission propagation profile.
- numerical integrator settings.
- force-model configuration.
- spacecraft mass and optical/aerodynamic properties.
- maneuver timeline execution.

Non-selected imported objects remain visible on the globe and available for range/conjunction-style analysis, but they continue using their native TLE/SGP4 visualization path and do not receive mission maneuvers.

## Propagator UI Behavior

Mission propagation profile selection is not cosmetic:

- `NUMERICAL` exposes backend-supported integrators from `GET /api/capabilities`, gravity degree/order, force-model toggles, spacecraft parameters, and expert integrator tolerances.
- `KEPLERIAN` hides numerical force-model and integrator controls. The Mission Summary reports force models and integrator as not applicable.
- `TLE_SGP4` hides numerical controls. The Mission Summary reports force models as embedded in SGP4 and integrator as not applicable.

Finite-burn mission events require `NUMERICAL` propagation. If enabled finite burns exist under `KEPLERIAN` or `TLE_SGP4`, the Mission Planner disables trajectory generation and explains the incompatibility.

## Capability Registry

The frontend does not hardcode the available propagators, integrators, or force-model support matrix. On startup it calls:

```text
GET /api/capabilities
```

The response advertises:

- propagators: `NUMERICAL`, `KEPLERIAN`, `TLE_SGP4`.
- integrators: `DORMAND_PRINCE_853`, `DORMAND_PRINCE_54`, `CLASSICAL_RUNGE_KUTTA`, `GILL`, `LUTHER`, `MIDPOINT`, `THREE_EIGHTHES`, `ADAMS_BASHFORTH`, `ADAMS_MOULTON`, `GRAGG_BULIRSCH_STOER`.
- which propagators support integrators, force models, maneuvers, and spacecraft physical parameters.

The Mission Planner and Analysis views render controls from this registry and read/write the same persisted mission propagation profile.
