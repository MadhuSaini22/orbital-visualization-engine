package com.orbitvisualizationengine.server.catalog.provider.exception;

import java.net.URI;
import org.springframework.web.client.RestClientResponseException;

public class ProviderHttpException extends CatalogProviderException {
  private final URI uri;
  private final Integer statusCode;

  public ProviderHttpException(String providerCode, URI uri, String message, Throwable cause) {
    super(providerCode, message, cause);
    this.uri = uri;
    this.statusCode = null;
  }

  private ProviderHttpException(String providerCode, URI uri, int statusCode, String message, Throwable cause) {
    super(providerCode, message, cause);
    this.uri = uri;
    this.statusCode = statusCode;
  }

  public static ProviderHttpException forStatus(String providerCode, URI uri, RestClientResponseException exception) {
    return new ProviderHttpException(
        providerCode,
        uri,
        exception.getStatusCode().value(),
        "Provider HTTP request failed with status " + exception.getStatusCode().value(),
        exception);
  }

  public URI uri() {
    return uri;
  }

  public Integer statusCode() {
    return statusCode;
  }
}
