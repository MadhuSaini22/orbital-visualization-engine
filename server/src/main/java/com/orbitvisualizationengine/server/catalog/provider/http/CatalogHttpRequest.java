package com.orbitvisualizationengine.server.catalog.provider.http;

import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import java.net.URI;

public record CatalogHttpRequest(
    String providerCode,
    URI uri,
    CatalogDataFormat acceptFormat,
    String userAgent) {
}
