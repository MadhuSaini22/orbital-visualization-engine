package com.orbitvisualizationengine.server.catalog.provider.exception;

public class ProviderConfigurationException extends CatalogProviderException {
  public ProviderConfigurationException(String message) {
    super("configuration", message);
  }
}
