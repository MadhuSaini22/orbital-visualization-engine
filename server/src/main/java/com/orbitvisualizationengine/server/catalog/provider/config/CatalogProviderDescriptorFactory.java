package com.orbitvisualizationengine.server.catalog.provider.config;

import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSourceDescriptor;
import com.orbitvisualizationengine.server.catalog.provider.ProviderEndpointDefinition;
import java.util.EnumMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class CatalogProviderDescriptorFactory {
  public CatalogSourceDescriptor from(CatalogProviderProperties.Provider provider) {
    Map<CatalogEndpoint, ProviderEndpointDefinition> endpoints = new EnumMap<>(CatalogEndpoint.class);
    provider.endpoints().forEach((key, endpoint) -> endpoints.put(key,
        new ProviderEndpointDefinition(key, endpoint.format(), endpoint.path(), endpoint.authenticated())));
    return new CatalogSourceDescriptor(
        provider.code(),
        provider.displayName(),
        provider.providerType(),
        provider.baseUrl(),
        provider.capabilities(),
        provider.formats(),
        Map.copyOf(endpoints));
  }
}
