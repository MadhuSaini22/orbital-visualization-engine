# Phase B Propagation Bridge Report

Date: 2026-06-01

## Boundary

Phase B adds a bridge from mission timeline events to neutral propagation maneuver commands. It does not change orbital physics, trajectory output format, existing finite-burn behavior, force-model math, Orekit integration semantics, conjunction logic, or frontend code.

## Old Flow

```text
ManeuverRepository
  -> List<ManeuverEvent>
  -> PropagationContext.maneuvers
  -> NumericalPropagator.forceModels
  -> legacy finite-burn command adapter
  -> OrekitManeuverFactory.constantThrust
  -> ConstantThrustManeuver
  -> propagator.addForceModel
  -> EphemerisGenerator
  -> BoundedPropagator
  -> Trajectory API
```

The legacy path remains active and backward compatible.

## New Flow

```text
MissionTimelineEvent
  -> MissionTimelinePropagationService
  -> TimelineExecutor
  -> PropagationManeuverCommand
  -> PropagationContext.maneuverCommands
  -> NumericalPropagator.forceModels
  -> OrekitManeuverFactory.constantThrust
  -> ConstantThrustManeuver
  -> propagator.addForceModel
  -> EphemerisGenerator
  -> BoundedPropagator
  -> Trajectory API
```

The new read path is gated by:

```text
orbit.mission-timeline-propagation-enabled=false
```

When false, mission timeline propagation commands are not generated. When true, `MissionTimelinePropagationService` can attach timeline-generated commands to a propagation context. Existing orbit APIs still use the legacy path unless a mission-aware caller explicitly supplies timeline commands.

## Class Diagram

```text
MissionTimelineEvent
  type: TimelineEventType
  executionTime
  parameters

TimelineExecutor
  + toPropagationCommands(List<MissionTimelineEvent>)

PropagationManeuverCommand
  id
  maneuverType
  executionTimeUtc
  durationSeconds
  thrustNewton
  ispSeconds
  directionFrame
  directionX/Y/Z
  enabled
  metadata

MissionTimelinePropagationService
  + commandsForMission(missionId)
  + withMissionTimelineCommands(context, missionId)

LegacyManeuverCommandAdapter
  + fromLegacy(ManeuverEvent, SpacecraftModel)

OrekitManeuverFactory
  + constantThrust(PropagationManeuverCommand)

PropagationContext
  maneuvers: List<ManeuverEvent>
  maneuverCommands: List<PropagationManeuverCommand>

NumericalPropagator
  + forceModels(PropagationContext)
```

## Files Created

- `server/src/main/java/com/orbitvisualizationengine/server/propagation/PropagationManeuverType.java`
- `server/src/main/java/com/orbitvisualizationengine/server/propagation/PropagationManeuverCommand.java`
- `server/src/main/java/com/orbitvisualizationengine/server/propagation/OrekitManeuverFactory.java`
- `server/src/main/java/com/orbitvisualizationengine/server/propagation/LegacyManeuverCommandAdapter.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/TimelineExecutor.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionTimelinePropagationService.java`
- `server/src/test/java/com/orbitvisualizationengine/server/propagation/PhaseBPropagationBridgeParityTest.java`

## Files Modified

- `server/src/main/java/com/orbitvisualizationengine/server/config/AppProperties.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/TimelineEventType.java`
- `server/src/main/java/com/orbitvisualizationengine/server/propagation/NumericalPropagator.java`
- `server/src/main/java/com/orbitvisualizationengine/server/propagation/PropagationContext.java`
- `server/src/main/resources/application.yml`
- `server/src/main/resources/db/schema.sql`

Existing Phase A files remain part of the uncommitted mission timeline work:

- `server/src/main/java/com/orbitvisualizationengine/server/api/MissionController.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/Mission.java`
- `server/src/main/java/com/orbitvisualizationengine/server/domain/MissionTimelineEvent.java`
- `server/src/main/java/com/orbitvisualizationengine/server/dto/*Mission*.java`
- `server/src/main/java/com/orbitvisualizationengine/server/repository/MissionRepository.java`
- `server/src/main/java/com/orbitvisualizationengine/server/repository/MissionTimelineEventRepository.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionService.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionTimelineService.java`
- `server/src/main/java/com/orbitvisualizationengine/server/service/MissionTimelineValidator.java`
- `server/src/test/java/com/orbitvisualizationengine/server/service/MissionTimelineServiceTest.java`

## Behavior Preserved

- Legacy `ManeuverEvent` still enters propagation through `PropagationContext.maneuvers`.
- Legacy finite burns still require `maneuverModelEnabled=true`.
- Legacy `durationSec <= 0` maneuvers are still ignored by `NumericalPropagator`.
- Existing `ConstantThrustManeuver` behavior is preserved by extracting construction into `OrekitManeuverFactory`.
- No trajectory API response shape was changed.
- No conjunction/frontend code was changed.

## Timeline Executor Rules

Supported in Phase B:

- `FINITE_BURN`

Ignored:

- disabled events.

Explicitly rejected:

- `COAST`
- `IMPULSIVE_BURN`
- `VECTOR_BURN`
- `STATION_KEEPING`
- `PLANE_CHANGE`
- `HOHMANN_TRANSFER`

Required `FINITE_BURN` parameters:

- `durationSeconds`
- `thrustNewton`
- `ispSeconds`
- `directionFrame`
- `directionX`
- `directionY`
- `directionZ`

The executor has no Orekit dependency and performs no propagation.

## Trajectory Parity Evidence

Command:

```text
mvn clean test -Dtest=MissionTimelineServiceTest,PhaseBPropagationBridgeParityTest,NumericalEphemerisTrajectoryTest
```

Result:

```text
Tests run: 17, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Bridge parity output:

```text
Phase B bridge parity: maxPositionDelta=0.000000000 m maxVelocityDelta=0.000000000000 mm/s
```

Required tolerance:

- position delta < 1 mm.
- velocity delta < 0.001 mm/s.

Observed result:

- position delta = 0 m.
- velocity delta = 0 mm/s.

Full backend test command:

```text
mvn test
```

Full backend result:

```text
Tests run: 121, Failures: 0, Errors: 0, Skipped: 26
BUILD SUCCESS
```

## Regression Risk Analysis

Low risk:

- `ConstantThrustManeuver` construction was extracted, not redesigned.
- Legacy and timeline paths both produce `PropagationManeuverCommand`.
- `NumericalPropagator` still installs force models via the same `forceModels(context).forEach(propagator::addForceModel)` line.
- Existing orbit APIs still build contexts from legacy maneuvers only.

Medium future risk:

- Mission timeline commands are not yet connected to a public mission trajectory API.
- Cache keys still do not include mission timeline fingerprints because existing trajectory APIs are legacy-only.
- `PropagationContext.maneuvers` remains for backward compatibility and should not be removed until parity is proven through mission-aware APIs.

## Migration Safety Analysis

Zero-regression migration sequence:

1. Keep legacy `ManeuverEvent` path active.
2. Extract finite-burn construction into `OrekitManeuverFactory`.
3. Convert legacy maneuvers into `PropagationManeuverCommand` through `LegacyManeuverCommandAdapter`.
4. Convert enabled mission timeline `FINITE_BURN` events into the same command type through `TimelineExecutor`.
5. Store future timeline commands in `PropagationContext.maneuverCommands`.
6. Add mission-aware trajectory APIs in a later phase.
7. Only after parity over public mission APIs, deprecate legacy propagation use.

Do not delete yet:

- `ManeuverEvent`
- `ManeuverRepository`
- `/api/maneuvers`
- `PropagationContext.maneuvers`
- legacy command adapter

## Remaining Work Before Frontend Integration

- Add a mission-aware trajectory API that accepts a mission ID.
- Add timeline fingerprinting to ephemeris cache keys for mission-aware trajectories.
- Add frontend timeline CRUD integration.
- Add burn detail panel backed by mission timeline commands.
- Add Phase C support for impulsive and vector burns.
- Add validation/reporting for dry mass and propellant constraints.

## Final Verdict

```text
APPROVE
```

Phase B bridge is production-safe as an additive bridge. It preserves legacy propagation behavior and proves trajectory parity for equivalent finite burns.
