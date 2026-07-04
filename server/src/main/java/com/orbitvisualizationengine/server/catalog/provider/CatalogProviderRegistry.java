package com.orbitvisualizationengine.server.catalog.provider;

import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderNotFoundException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class CatalogProviderRegistry {
  private final Map<String, CatalogSource> providers;

  public CatalogProviderRegistry(List<CatalogSource> providers) {
    this.providers = providers.stream()
        .collect(Collectors.toUnmodifiableMap(CatalogSource::code, Function.identity()));
  }

  public CatalogSource require(String providerCode) {
    CatalogSource provider = providers.get(providerCode);
    if (provider == null) {
      throw new ProviderNotFoundException(providerCode);
    }
    return provider;
  }

  public Collection<CatalogSourceDescriptor> descriptors() {
    return providers.values().stream()
        .map(CatalogSource::descriptor)
        .toList();
  }
}
