package com.orbitvisualizationengine.server.catalog.provider;

import java.net.URI;
import java.util.Map;
import java.util.Set;

public record CatalogSourceDescriptor(
    String code,
    String displayName,
    CatalogProviderType providerType,
    URI baseUri,
    Set<CatalogCapability> capabilities,
    Set<CatalogDataFormat> formats,
    Map<CatalogEndpoint, ProviderEndpointDefinition> endpoints) {

  public boolean supports(CatalogCapability capability) {
    return capabilities.contains(capability);
  }

  public boolean supports(CatalogDataFormat format) {
    return formats.contains(format);
  }
}
