package com.orbitvisualizationengine.server.catalog.provider;

public interface CatalogSource {
  CatalogSourceDescriptor descriptor();

  CatalogProviderResponse<?> fetch(CatalogFetchRequest request);

  default String code() {
    return descriptor().code();
  }

  default boolean supports(CatalogCapability capability) {
    return descriptor().supports(capability);
  }

  default boolean supports(CatalogDataFormat format) {
    return descriptor().supports(format);
  }
}
