package com.orbitvisualizationengine.server.catalog.provider.exception;

public class CatalogProviderException extends RuntimeException {
  private final String providerCode;

  public CatalogProviderException(String providerCode, String message) {
    super(message);
    this.providerCode = providerCode;
  }

  public CatalogProviderException(String providerCode, String message, Throwable cause) {
    super(message, cause);
    this.providerCode = providerCode;
  }

  public String providerCode() {
    return providerCode;
  }
}
