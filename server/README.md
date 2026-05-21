# Orbit Analysis Server

Spring Boot backend for production-style orbit data ingestion, propagation, maneuver preview, and conjunction review.

The frontend should render data. This service owns external credentials, database writes, and authoritative analysis workflows.

## Stack

- Java 21
- Spring Boot
- PostgreSQL / Neon
- Orekit
- CelesTrak GP/TLE ingestion
- Space-Track public CDM ingestion

## Local Setup

Create `server/.env` or export these variables in your shell:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
SPACE_TRACK_USERNAME=
SPACE_TRACK_PASSWORD=
OREKIT_DATA_PATH=./orekit-data
INGESTION_ENABLED=false
```

Do not commit real database URLs or Space-Track credentials.

Install Java 21 and Maven, then run:

```bash
mvn spring-boot:run
```

The service starts on:

```text
http://localhost:8080
```

## APIs

```text
GET  /health
GET  /api/catalog/groups
GET  /api/catalog/satellites?group=STATIONS
GET  /api/catalog/satellites/{noradId}
POST /api/orbits/propagate
GET  /api/orbits/{noradId}/current
GET  /api/orbits/{noradId}/trajectory?from=&to=&stepSeconds=30
GET  /api/maneuvers?noradId=25544
POST /api/maneuvers
POST /api/maneuvers/preview
GET  /api/conjunctions?noradId=25544
GET  /api/conjunctions/{id}
```

## Important Accuracy Notes

Current propagation uses Orekit's TLE/SGP4 path. That is a strong upgrade from browser-only analysis, but production maneuver planning still needs real finite-burn or impulsive maneuver modeling configured in Orekit.

Maneuver preview currently returns baseline pre/post propagation windows with an explicit warning. The API shape is ready for real burn modeling, but the burn physics is not enabled yet.

Space-Track `cdm_public` ingestion is real conjunction data ingestion, but production collision risk still requires careful CDM parsing, covariance handling, and operational thresholds.

## Orekit Data

For reliable Earth orientation and time handling, download and mount an Orekit data directory and point `OREKIT_DATA_PATH` to it. Without this, some frame/time conversions may fail or use limited defaults.
