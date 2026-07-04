package com.orbitvisualizationengine.server.catalog.provider;

import java.time.Instant;

public record CatalogProviderResponse<T>(
    CatalogSourceDescriptor source,
    CatalogEndpoint endpoint,
    CatalogDataFormat format,
    Instant fetchedAt,
    T body) {
}
