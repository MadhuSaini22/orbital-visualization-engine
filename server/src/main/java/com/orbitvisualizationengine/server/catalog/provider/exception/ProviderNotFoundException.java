package com.orbitvisualizationengine.server.catalog.provider.exception;

public class ProviderNotFoundException extends CatalogProviderException {
  public ProviderNotFoundException(String providerCode) {
    super(providerCode, "Catalog provider is not registered: " + providerCode);
  }
}
