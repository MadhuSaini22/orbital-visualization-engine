# Public Satellite Catalog Architecture

## Milestone 3: Ingestion Pipeline Foundation

Milestone 3 adds the backend-only ingestion pipeline that turns one provider response into one published catalog version. It does not schedule ingestion, expose ingestion over REST, run Orekit, propagate orbits, or perform proximity analysis.

The pipeline is intentionally provider-neutral. Business ingestion code depends on `CatalogProviderRegistry` and `CatalogSource`; provider-specific URL and endpoint details live in `providers.yml`.

## Ingestion Sequence

```mermaid
sequenceDiagram
  participant Caller as Future Scheduler or Internal Caller
  participant Ingestion as CatalogIngestionService
  participant Registry as CatalogProviderRegistry
  participant Source as CatalogSource
  participant Normalizer as CatalogNormalizer
  participant Validator as CatalogValidator
  participant Hasher as CatalogHasher
  participant Persistence as CatalogPersistenceService
  participant Repository as Catalog Repositories
  participant Differ as CatalogDiffer
  participant DB as PostgreSQL

  Caller->>Ingestion: ingest(providerCode)
  Ingestion->>Registry: require(providerCode)
  Registry-->>Ingestion: CatalogSource
  Ingestion->>Source: fetch(configured ingestion request)
  Source-->>Ingestion: CatalogProviderResponse
  Ingestion->>Normalizer: normalize(response)
  Normalizer-->>Ingestion: normalized records
  Ingestion->>Validator: validate(records)
  Ingestion->>Hasher: catalogSha256(records)
  Ingestion->>Persistence: ensureSource(source descriptor)
  Persistence->>Repository: ensure source
  Repository->>DB: upsert catalog_sources metadata
  Ingestion->>Persistence: loadCurrentCatalog(sourceId)
  Persistence->>Repository: load current projection
  Repository->>DB: read satellite_catalog projection
  Ingestion->>Differ: diff(incoming, current)
  Ingestion->>Persistence: createVersion(IMPORTING)
  Persistence->>Repository: create version
  Repository->>DB: insert catalog_versions
  Ingestion->>Persistence: createSyncRun(RUNNING)
  Persistence->>Repository: create sync run
  Repository->>DB: insert catalog_sync_runs
  Ingestion->>Persistence: append TLE and REMOVED history
  Persistence->>Repository: append history rows
  Repository->>DB: insert satellite_catalog_history
  Ingestion->>Persistence: update latest projection
  Persistence->>Repository: update projection
  Repository->>DB: upsert/delete satellite_catalog
  Ingestion->>Persistence: completeSyncRun(SUCCEEDED)
  Persistence->>Repository: complete sync run
  Repository->>DB: update catalog_sync_runs
  Ingestion->>Persistence: publishVersion(AVAILABLE)
  Persistence->>Repository: publish version
  Repository->>DB: update catalog_versions
  Ingestion-->>Caller: CatalogIngestionResult
```

## Transaction Boundary

`CatalogIngestionService.ingest(providerCode)` is transactional. Validation and normalization happen before catalog version rows are created, so malformed provider payloads are rejected before database mutation. Once persistence starts, the version, sync run, history appends, projection updates, and publication occur in one database transaction.

This prevents partially imported catalogs from being visible. If the transaction fails, PostgreSQL rolls the work back and no `IMPORTING` catalog version is left behind.

## Component Responsibilities

`CatalogIngestionService`

Coordinates the workflow only: provider lookup, fetch, normalize, validate, hash, diff, persist, and publish. It owns the transaction boundary but does not parse TLEs, compute hashes, compare records, or know SQL.

`CatalogNormalizer`

Converts provider response DTOs into `NormalizedCatalogRecord`. It extracts TLE epoch, orbital fields, launch designator fields, and source payload values into a stable internal shape for validation and persistence.

`CatalogValidator`

Rejects malformed ingestion inputs before database mutation. It checks required object data, TLE line shape, valid epoch, SHA-256 format, and duplicate NORAD IDs inside one provider response.

`CatalogHasher`

Computes deterministic SHA-256 values for normalized TLE pairs and full catalog snapshots. TLE hashes are used for change detection; catalog hashes make catalog versions auditable.

`CatalogDiffer`

Compares normalized incoming records with the current `satellite_catalog` projection for the same source. It classifies records as added, changed, unchanged, or removed.

`CatalogPersistenceService`

Coordinates persistence operations inside the ingestion transaction. It does not contain SQL. It derives persistence inputs such as version counters and delegates table-specific reads and writes to repositories.

`CatalogSourceRepository`

Owns SQL for `catalog_sources`. It creates or updates provider source metadata so catalog versions can reference a stable source id instead of free-text provider names.

`CatalogVersionRepository`

Owns SQL for `catalog_versions`. It creates the immutable version row in `IMPORTING` state and publishes it as `AVAILABLE` after history and projection writes complete.

`CatalogSyncRunRepository`

Owns SQL for `catalog_sync_runs`. It records the ingestion attempt tied one-to-one to the catalog version and stores ingestion counters for auditability.

`SatelliteCatalogHistoryRepository`

Owns SQL for `satellite_catalog_history`. It inserts `TLE` and `REMOVED` events only. It never updates or deletes history rows, preserving append-only reproducibility.

`SatelliteCatalogRepository`

Owns SQL for `satellite_catalog`, the mutable latest-active projection. It loads the current provider projection for diffing, upserts changed active records, marks unchanged records as seen, and removes active projection rows for removed objects.

## Versioning Rules

Each ingestion creates exactly one `catalog_versions` row. The row starts as `IMPORTING` and is published as `AVAILABLE` only after history and projection writes complete.

Changed and added TLEs create `TLE` rows in `satellite_catalog_history`. Missing objects from the same provider create `REMOVED` rows. Unchanged objects do not duplicate history; their latest projection is only marked as seen in the new version.

`satellite_catalog_history` remains append-only. `satellite_catalog` is the mutable latest-active projection and may be updated or pruned when objects are removed.

## Provider Configuration

`providers.yml` defines the active provider and its ingestion request:

- endpoint enum
- expected data format
- configured query parameters
- provider metadata and capabilities

The ingestion pipeline does not hardcode provider URLs or CelesTrak endpoint paths.

## Milestone 4: Catalog Runtime Layer

Milestone 4 adds the read-only runtime API for the latest published catalog projection. This layer does not ingest provider data, call providers, schedule work, expose REST endpoints, run Orekit, parse TLEs, create propagators, or perform proximity analysis.

The runtime catalog is the boundary future analysis modules should depend on when they need public catalog satellites. It reads from PostgreSQL only and returns immutable `CatalogSatellite` objects.

## Runtime Access Pattern

```mermaid
sequenceDiagram
  participant Caller as Future Analysis Service
  participant Service as CatalogService
  participant Repository as CatalogRepository
  participant DB as PostgreSQL
  participant Mapper as CatalogSatelliteMapper

  Caller->>Service: findByNoradId / findAll / findByName / exists / count / stream
  Service->>Repository: read latest published projection
  Repository->>DB: query satellite_catalog + current TLE history + AVAILABLE version
  DB-->>Repository: catalog rows
  Repository-->>Service: CatalogSatelliteRecord
  Service->>Mapper: map database record
  Mapper-->>Service: CatalogSatellite
  Service-->>Caller: runtime catalog model
```

## Runtime Responsibilities

`CatalogService`

Public runtime entry point for catalog reads. It validates caller input, throws a catalog-specific exception for missing NORAD ids, maps repository records into runtime models, and exposes `findByNoradId`, `findAll`, `findByName`, `exists`, `count`, and `stream`.

`CatalogRepository`

Owns SQL for read-only access to the latest published projection. Lightweight checks such as `exists` and `count` read directly from `satellite_catalog`. Rich reads join the projection to the current `satellite_catalog_history` row for TLE/object fields and to version/source tables for catalog provenance.

`CatalogSatelliteRecord`

Internal repository record representing the selected database columns. It is not exposed outside the runtime repository/mapper boundary.

`CatalogSatelliteMapper`

Maps database records into immutable runtime catalog objects. It keeps row shape separate from the public model future analysis services will consume.

`CatalogSatellite`

Immutable runtime model for a published catalog satellite. It carries the latest active TLE and catalog/version provenance but performs no TLE parsing or physics.

## Runtime Rules

Runtime catalog access is provider-agnostic. It never talks to CelesTrak, Space-Track, or any future provider. It only reads published database state created by ingestion.

The runtime layer intentionally does not cache results yet. Future modules such as propagation, event detection, relative motion, and proximity analysis should consume `CatalogService` instead of querying catalog tables directly.

## Milestone 5: Orekit Runtime Integration

Milestone 5 adds the isolated bridge from runtime catalog satellites to Orekit TLE objects and TLE propagators. It does not propagate trajectories, run event detection, compute visibility, perform conjunction or relative-motion analysis, expose REST APIs, schedule work, or cache runtime satellites.

Orekit dependencies are confined to the `catalog.runtime.orekit` package. The bridge consumes `CatalogSatellite` objects from the runtime catalog layer and never reads repositories, tables, providers, or provider DTOs.

## Orekit Runtime Bridge

```mermaid
sequenceDiagram
  participant Caller as Future Analysis Service
  participant Runtime as RuntimeSatelliteService
  participant Catalog as CatalogService
  participant TleFactory as OrekitTleFactory
  participant Orekit as Orekit

  Caller->>Runtime: findByNoradId(noradCatalogId)
  Runtime->>Catalog: findByNoradId(noradCatalogId)
  Catalog-->>Runtime: CatalogSatellite
  Runtime->>TleFactory: createTle(CatalogSatellite)
  TleFactory->>Orekit: new TLE(line1, line2)
  Orekit-->>TleFactory: TLE
  Runtime-->>Caller: RuntimeSatellite
```

## Orekit Bridge Responsibilities

`OrekitTleFactory`

Validates the runtime catalog TLE fields and constructs an Orekit `TLE`. It checks required lines, exact TLE line length, line prefixes, matching line satellite numbers, and consistency with the catalog NORAD id before delegating to Orekit.

`OrekitPropagatorFactory`

Constructs Orekit `TLEPropagator` instances from a validated `TLE` or `CatalogSatellite` on demand. It owns propagator construction only and does not run propagation. Propagators are deliberately not stored inside `RuntimeSatellite`, keeping the runtime model independent from a specific propagation algorithm lifecycle.

`RuntimeSatellite`

Immutable wrapper containing the source `CatalogSatellite` and validated Orekit `TLE`. It is the handoff object future analysis services can consume before choosing an SGP4, numerical, DSST, ephemeris, or custom propagation strategy.

`RuntimeSatelliteService`

Coordinates the bridge from catalog lookup to runtime satellite construction. It depends on `CatalogService` and `OrekitTleFactory`; it never talks to repositories or providers.

`InvalidCatalogTleException`

Runtime-specific exception for malformed catalog TLEs. It keeps Orekit parsing failures from leaking as low-level exceptions across the catalog runtime boundary.

## Orekit Runtime Rules

The Orekit runtime bridge is provider-neutral. It does not know whether a satellite came from CelesTrak, Space-Track, a user import, or a commercial catalog. Its only input is the published `CatalogSatellite` model.

The bridge validates TLEs and can create propagator objects on demand through `OrekitPropagatorFactory`, but performs no propagation loops. Time-stepping, event detection, proximity analysis, visibility, and relative-motion workflows belong to later modules.

## Milestone 6: Propagation Engine

Milestone 6 adds the runtime propagation layer on top of `RuntimeSatellite`. It samples a single runtime satellite over a caller-provided time span and returns immutable Cartesian state history. It does not perform event detection, visibility analysis, conjunction analysis, proximity search, relative motion, caching, background work, REST exposure, scheduler integration, force-model configuration, or database access.

The public propagation API is provider-neutral. It consumes a `RuntimeSatellite` already created by the Milestone 5 bridge and never talks to catalog providers, ingestion services, repositories, or controllers.

## Propagation Sequence

```mermaid
sequenceDiagram
  participant Caller as Future Analysis Service
  participant Service as PropagationService
  participant Engine as PropagationEngine
  participant OrekitEngine as OrekitTlePropagationEngine
  participant Factory as OrekitPropagatorFactory
  participant Orekit as Orekit TLEPropagator

  Caller->>Service: propagate(RuntimeSatellite, start, stop, step)
  Service->>Service: validate request and build sample times
  Service->>Engine: propagate(satellite, sampleTimes)
  Engine->>OrekitEngine: TLE propagation implementation
  OrekitEngine->>Factory: createPropagator(runtimeSatellite.tle)
  Factory->>Orekit: selectExtrapolator(TLE)
  Orekit-->>Factory: TLEPropagator
  loop each sample time
    OrekitEngine->>Orekit: propagate(sampleTime)
    Orekit-->>OrekitEngine: SpacecraftState
    OrekitEngine->>OrekitEngine: map to PropagatedState
  end
  OrekitEngine-->>Service: immutable state list
  Service-->>Caller: PropagationResult
```

## Propagation Responsibilities

`PropagationService`

Public runtime entry point for propagation. It validates the runtime satellite, start time, stop time, and positive step duration; builds deterministic sample times including the final stop time; delegates propagation to the configured engine; and returns an immutable `PropagationResult`.

`PropagationEngine`

Small internal boundary between propagation orchestration and the concrete propagation implementation. It exists so the service does not depend on Orekit classes directly, while avoiding a broader strategy framework before multiple propagator families are actually implemented.

`OrekitTlePropagationEngine`

Current production implementation for TLE propagation. It creates a fresh `TLEPropagator` on demand through `OrekitPropagatorFactory`, propagates each requested sample time, and maps Orekit `SpacecraftState` output into runtime models. It uses TEME for TLE output because that is the native SGP4 frame.

`PropagatedState`

Immutable runtime state sample containing timestamp, output frame name, Cartesian position, and Cartesian velocity. It intentionally does not expose Orekit `SpacecraftState` so future modules can consume propagation output without depending on Orekit internals.

`PropagationResult`

Immutable propagation product containing the source `RuntimeSatellite`, requested time bounds, requested step duration, and generated state history. Later event, visibility, relative-motion, and proximity modules can consume this result without knowing how it was generated.

`PropagationException` and `PropagationRequestException`

Runtime-specific failures for propagation. Invalid caller parameters fail before Orekit is invoked; Orekit/runtime failures are wrapped at the propagation boundary.

## Propagation Rules

The propagation layer creates propagators on demand and does not store them in `RuntimeSatellite` or cache them globally. This keeps propagator lifecycle local to one propagation request and leaves room for later NumericalPropagator, DSST, ephemeris-backed, or custom propagation engines.

Milestone 6 supports only TLE propagation. Future force-model configuration, maneuver handling, event detection, and proximity workflows should be built above this layer rather than mixed into the catalog runtime bridge.

## Milestone 7: Event Detection Framework

Milestone 7 adds the event detection framework above runtime propagation. It coordinates propagation result generation with optional event detector execution, but it does not implement concrete event behavior yet. There is no visibility, eclipse, conjunction, ground-station, relative-motion, maneuver, REST, scheduler, cache, database, or provider integration in this milestone.

The event framework is provider-neutral. It consumes `RuntimeSatellite` and the propagation runtime models; it never talks to catalog providers, ingestion services, repositories, controllers, or schedulers.

## Event Detection Sequence

```mermaid
sequenceDiagram
  participant Caller as Future Analysis Service
  participant Service as EventDetectionService
  participant Propagation as PropagationService
  participant EventEngine as EventDetectionEngine
  participant OrekitEvents as OrekitEventDetectionEngine
  participant Factory as EventDetectorFactory
  participant Orekit as Orekit Propagator

  Caller->>Service: detectEvents(satellite, start, stop, step, detectorDefinitions)
  Service->>Service: validate detector definitions
  Service->>Propagation: propagate(satellite, start, stop, step)
  Propagation-->>Service: PropagationResult
  Service->>EventEngine: detect(satellite, start, stop, definitions)
  EventEngine->>OrekitEvents: Orekit implementation
  alt no detector definitions
    OrekitEvents-->>EventEngine: empty event list
  else detector definitions requested
    OrekitEvents->>Factory: createDetectors(definitions, collector)
    Factory-->>OrekitEvents: Orekit EventDetector instances
    OrekitEvents->>Orekit: addEventDetector(...)
    OrekitEvents->>Orekit: propagate(start, stop)
    Orekit-->>OrekitEvents: detector callbacks
    OrekitEvents-->>EventEngine: collected PropagationEvent list
  end
  EventEngine-->>Service: events
  Service-->>Caller: EventDetectionResult
```

## Event Detection Responsibilities

`EventDetectionService`

Public event-detection entry point. It validates detector definition lists, invokes `PropagationService` to produce the normal state history, invokes `EventDetectionEngine` for event collection, and returns an immutable `EventDetectionResult`. It does not know Orekit and does not build detectors itself.

`EventDetectionEngine`

Internal boundary between event orchestration and the concrete event-detection implementation. This keeps detector execution independent from `PropagationService` and `PropagationEngine`, so future detector families can be added without modifying the propagation state-history path.

`OrekitEventDetectionEngine`

Orekit-specific event execution layer. It creates a fresh propagator for event detection, attaches Orekit `EventDetector` instances from `EventDetectorFactory`, runs the detector propagation interval, and returns collected runtime events. With no detector definitions, it returns an empty event list without running a second propagation.

`EventDetectorFactory`

Orekit-specific factory that maps runtime detector definitions to Orekit `EventDetector` instances using registered `OrekitEventDetectorBuilder` components. No concrete builders are implemented in this milestone; unsupported detector definitions fail clearly instead of silently doing nothing.

`PropagationEventDetectorDefinition`

Provider-neutral runtime detector definition contract. Future detector definitions such as visibility, eclipse, node crossing, apsis, distance threshold, conjunction, or custom events can implement this contract without changing `PropagationService` or `PropagationEngine`.

`PropagationEvent`

Immutable runtime event record containing event type, timestamp, crossing direction, detector name, and string attributes. It intentionally does not expose Orekit detector or spacecraft-state objects.

`PropagationEventType`

Runtime event taxonomy for future detector implementations: visibility, eclipse, conjunction, node crossing, apsis, distance threshold, and custom detector events.

`EventDetectionResult`

Immutable event-detection product containing the regular `PropagationResult` plus detected events. The event list is defensively copied and may be empty.

## Event Detection Rules

Event collection is separate from propagation result generation. `PropagationService` still produces state histories only. Event detection is layered above it and may run detector propagation independently when detector definitions exist.

The current implementation permits a future single-pass propagation model. `EventDetectionService` depends on the abstract `EventDetectionEngine`, not directly on `OrekitEventDetectionEngine`, and callers receive only `EventDetectionResult`. A later milestone can replace the internal engine with one that installs detectors during the same propagation pass that samples states, while preserving the public event-detection contract and leaving detector definitions unchanged.

Milestone 7 deliberately includes no concrete detectors. Future detector milestones should add focused detector definition records and matching Orekit detector builders under `catalog.runtime.propagation.orekit.events`, without changing the public propagation service or provider/catalog layers.
