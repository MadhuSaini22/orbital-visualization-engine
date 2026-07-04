package com.orbitvisualizationengine.server.catalog.provider.exception;

public class ProviderResponseException extends CatalogProviderException {
  public ProviderResponseException(String providerCode, String message) {
    super(providerCode, message);
  }

  public ProviderResponseException(String providerCode, String message, Throwable cause) {
    super(providerCode, message, cause);
  }
}
