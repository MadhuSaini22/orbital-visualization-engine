# Phase A Mission Timeline Architecture Report

Date: 2026-05-31

## Phase Boundary

Phase A creates the GMAT/STK-style mission timeline architecture only. It does not execute burns, does not change propagation behavior, does not add Orekit `ImpulseManeuver`, does not redesign finite burns, does not change conjunction logic, and does not redesign the UI.

## Audit Of Current Maneuver Code Paths

### Current Maneuver Write Paths

- `POST /api/maneuvers` accepts the legacy `ManeuverEvent` record and calls `ManeuverService.save`.
- `ManeuverService.save` delegates directly to `ManeuverRepository.save`.
- `ManeuverRepository.save` upserts into the existing `maneuvers` table.

Current write target:

```text
maneuvers(id, norad_id, name, status, event_time, delta_v_mps, duration_sec, frame, vector, metadata, created_at)
```

### Current Maneuver Read Paths

- `GET /api/maneuvers` lists records through `ManeuverService.list`.
- `ManeuverRepository.findByNoradId` reads all rows or rows for a NORAD ID.
- `OrekitOrbitAnalysisService.buildContext` reads `maneuvers.findByNoradId(noradId)` and places those records in `PropagationContext`.
- Frontend `fetchManeuvers` reads `/api/maneuvers` and `OrbitalDashboard.normalizeBackendManeuvers` maps them to UI maneuver events.

### Current Propagation Path

- `PropagationContext` contains `List<ManeuverEvent> maneuvers`.
- `NumericalPropagator.forceModels` checks `analysisConfig.maneuverModelEnabled()`.
- If enabled, it filters `durationSec() > 0` and creates Orekit `ConstantThrustManeuver` force models.
- Analytical propagators report `supportsManeuvers=false`, but there is no service-level rejection for existing maneuver rows.

Phase A will not change this behavior.

### Current Cache Path

- `OrekitOrbitAnalysisService.propagate` caches by NORAD ID, model name, analysis config, start, end, and step.
- The maneuver table content is not part of the cache key.

Phase A will not change propagation caching semantics, but the new timeline architecture will expose a future timeline version/fingerprint point.

### Current Visualization Path

- `OrbitalDashboard` loads maneuvers with `fetchManeuvers`.
- Maneuvers become `ManeuverSnapshot` objects.
- Backend/manual sources fetch only event-time states; server-driven pre/post maneuver paths are empty.
- `CesiumGlobe` renders markers and scaled visual burn vectors.

Phase A does not change the frontend.

### Current Validation Path

- Legacy maneuver create uses bean validation only because `ManeuverEvent` is a raw record without field annotations.
- Preview request has limited validation annotations.
- There is no explicit timeline ordering validation.

## Architecture Before

```text
Legacy /api/maneuvers
  -> ManeuverService
  -> ManeuverRepository
  -> maneuvers table

OrbitAnalysisService
  -> ManeuverRepository.findByNoradId
  -> PropagationContext(List<ManeuverEvent>)
  -> NumericalPropagator
  -> optional ConstantThrustManeuver force model

Frontend
  -> fetchManeuvers
  -> ManeuverSnapshot
  -> Cesium marker/vector visualization
```

## Architecture After Phase A

```text
/api/missions
  -> MissionService
  -> MissionRepository
  -> missions table

/api/missions/{missionId}/timeline/events
  -> MissionTimelineService
  -> MissionTimelineValidator
  -> MissionTimelineEventRepository
  -> mission_timeline_events table

/api/missions/{missionId}/timeline/events/reorder
  -> MissionTimelineService.reorder
  -> MissionTimelineValidator.validateTimelineOrdering
  -> mission_timeline_events.sequence_index updates

/api/missions/{missionId}/timeline/events/{eventId}/enable|disable
  -> MissionTimelineService.setEnabled
  -> mission_timeline_events.enabled update

Legacy /api/maneuvers
  -> unchanged

Propagation
  -> unchanged in Phase A
```

## New Domain Objects

### Mission

- `id`
- `name`
- `propagatorType`
- `scenarioStart`
- `scenarioEnd`
- `createdAt`
- `updatedAt`

### MissionTimelineEvent

- `id`
- `missionId`
- `sequenceIndex`
- `type`: `COAST`, `IMPULSIVE_BURN`, `VECTOR_BURN`, `FINITE_BURN`
- `name`
- `enabled`
- `executionTime`
- `parameters`
- `createdAt`
- `updatedAt`

## Validation Framework

Phase A validation covers architecture correctness only:

- execution time exists.
- event type exists.
- sequence index is valid.
- enabled flag exists.
- timeline ordering is valid: sequence indices are contiguous and unique after reorder.
- event execution time is inside mission scenario start/end.

No burn physics validation is included in Phase A.

## Database Migration Report

Phase A adds two new tables and does not remove or mutate the existing `maneuvers` table.

```text
missions
  id text primary key
  name text not null
  propagator_type text not null
  scenario_start timestamptz not null
  scenario_end timestamptz not null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

mission_timeline_events
  id text primary key
  mission_id text not null references missions(id) on delete cascade
  sequence_index integer not null
  type text not null
  name text not null
  enabled boolean not null default true
  execution_time timestamptz not null
  parameters jsonb not null default '{}'::jsonb
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
```

Indexes:

- `mission_timeline_events_mission_sequence_unique` unique index on `(mission_id, sequence_index)`.
- `mission_timeline_events_mission_time_idx` on `(mission_id, execution_time)`.

Compatibility:

- Existing `/api/maneuvers` endpoints remain intact.
- Existing `maneuvers` table remains intact.
- Existing propagation continues reading legacy `maneuvers`.
- New mission timeline rows are not yet read by propagation.

Migration strategy:

1. Deploy additive schema.
2. Create missions/timeline events through new APIs.
3. In a later phase, introduce a bridge from mission timeline events into propagation context.
4. In a later phase, migrate legacy `maneuvers` into timeline events using metadata/type defaults.

Rollback strategy:

1. Stop using `/api/missions/**`.
2. Drop `mission_timeline_events`.
3. Drop `missions`.
4. Legacy `maneuvers`, propagation, and frontend marker flows continue to work.

## API Documentation

Mission APIs:

- `POST /api/missions`
- `GET /api/missions/{missionId}`
- `GET /api/missions`

Timeline APIs:

- `GET /api/missions/{missionId}/timeline/events`
- `POST /api/missions/{missionId}/timeline/events`
- `PATCH /api/missions/{missionId}/timeline/events/{eventId}`
- `DELETE /api/missions/{missionId}/timeline/events/{eventId}`
- `POST /api/missions/{missionId}/timeline/events/reorder`
- `POST /api/missions/{missionId}/timeline/events/{eventId}/enable`
- `POST /api/missions/{missionId}/timeline/events/{eventId}/disable`

## Test Evidence Plan

Focused service/repository tests will prove:

- create event.
- update event.
- delete event.
- reorder event.
- enable/disable event.

The tests use an in-memory fake repository so they validate Phase A service behavior without requiring a live Postgres database.

## Test Evidence

Command run:

```text
mvn clean test -Dtest=MissionTimelineServiceTest
```

Result:

```text
Tests run: 12, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Covered Phase A operations:

- create event.
- update event.
- delete event with sequence compaction.
- reorder events.
- enable/disable event.
- required `sequenceIndex` validation.
- concurrent create safety.
- concurrent reorder safety.
- concurrent delete safety.
- simulated rollback during create.
- simulated rollback during reorder.
- simulated rollback during delete.

## Phase A Safety Fix Evidence

Safety blockers from review were addressed without touching propagation, Orekit, maneuver physics, conjunctions, or frontend code.

Implemented hardening:

- `@Transactional` boundaries on timeline mutations: create, update, delete, reorder, enable, disable.
- Mission-scoped in-process mutation serialization in `MissionTimelineService`.
- Mission row lock through `select * from missions where id = ? for update`.
- Required `sequenceIndex` by changing create DTO from primitive `int` to nullable `Integer` with `@NotNull @Min(0)`.
- Non-negative resequencing strategy that no longer uses temporary negative sequence indices.
- Removed the unsafe sequence shift helper.
- Added database `CHECK` constraints for scenario window, valid propagator enum values, non-negative sequence index, and valid timeline event type values.

Race condition proof:

- `concurrentCreatesRemainContiguousAndUnique`
- `concurrentReordersLeaveValidTimeline`
- `concurrentDeletesLeaveValidTimeline`

Rollback proof:

- `createRollsBackWhenResequenceFails`
- `reorderRollsBackWhenResequenceFails`
- `deleteRollsBackWhenResequenceFails`

Fresh audit verdict after safety fixes:

```text
APPROVE
```

Reasoning:

- No propagation files changed.
- No trajectory generation files changed.
- No cache files changed.
- `NumericalPropagator` was not changed.
- Orekit integration was not changed.
- Existing `/api/maneuvers` compatibility remains unchanged.
- Timeline ordering is now protected by service validation, transaction boundaries, mission-level locking, DB row locking, unique index, and DB check constraints.

## Exact Files Modified

Production files:

- `server/src/main/resources/db/schema.sql`
- `server/src/main/java/com/orbitvisualizationengine/server/api/MissionController.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/Mission.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/MissionTimelineEvent.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/TimelineEventType.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/CreateMissionRequest.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/CreateTimelineEventRequest.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/MissionResponse.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/MissionTimelineEventResponse.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/ReorderTimelineRequest.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/UpdateTimelineEventRequest.java`
- `server/src/main/java/com/orbitvisualizationengine/server/repository/MissionRepository.java`
- `server/src/main/java/com/orbitvisualizationengine/server/repository/MissionTimelineEventRepository.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionService.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionTimelineService.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionTimelineValidator.java`

Test files:

- `server/src/test/java/com/orbitvisualizationengine/server/service/MissionTimelineServiceTest.java`

Audit files:

- `audit/maneuver-architecture-audit/report.md`
- `audit/maneuver-architecture-audit/phase-a-mission-timeline-report.md`

## Implementation Boundary Confirmation

Phase A did not modify:

- `NumericalPropagator`
- `PropagationContext`
- `OrekitOrbitAnalysisService`
- `ManeuverService`
- `ManeuverRepository`
- frontend Cesium/maneuver UI
- conjunction service

The new mission timeline is an additive source-of-truth architecture for future maneuver execution, but it is intentionally not wired into Orekit propagation yet.

## Original Expected Files Modified

Expected additions:

- mission domain records/enums.
- mission DTOs.
- mission repositories.
- mission timeline validator.
- mission service and controller.
- additive schema SQL.
- focused mission timeline tests.

Expected unchanged areas:

- `NumericalPropagator`
- `PropagationContext`
- `OrekitOrbitAnalysisService`
- `ManeuverService`
- `ManeuverRepository`
- frontend Cesium/maneuver UI
