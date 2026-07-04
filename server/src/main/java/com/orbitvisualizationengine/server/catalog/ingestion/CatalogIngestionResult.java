package com.orbitvisualizationengine.server.catalog.ingestion;

public record CatalogIngestionResult(
    long catalogVersionId,
    long syncRunId,
    int totalObjects,
    int activeObjects,
    int changedObjects,
    int addedObjects,
    int removedObjects,
    String catalogSha256) {
}
