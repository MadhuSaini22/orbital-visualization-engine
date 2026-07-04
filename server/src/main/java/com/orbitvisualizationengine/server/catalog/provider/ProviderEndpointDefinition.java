package com.orbitvisualizationengine.server.catalog.provider;

public record ProviderEndpointDefinition(
    CatalogEndpoint endpoint,
    CatalogDataFormat format,
    String pathTemplate,
    boolean authenticated) {
}
