package com.orbitvisualizationengine.server.catalog.ingestion;

import java.time.Instant;

public record CurrentCatalogRecord(
    int noradCatalogId,
    String tleSha256,
    long firstSeenVersionId,
    Instant firstSeenAt) {
}
