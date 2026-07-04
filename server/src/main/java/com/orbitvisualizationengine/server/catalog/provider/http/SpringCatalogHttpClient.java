package com.orbitvisualizationengine.server.catalog.provider.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderHttpException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class SpringCatalogHttpClient implements CatalogHttpClient {
  private final RestClient restClient;

  public SpringCatalogHttpClient(RestClient.Builder builder) {
    this.restClient = builder.build();
  }

  @Override
  public String getText(CatalogHttpRequest request) {
    try {
      return restClient.get()
          .uri(request.uri())
          .accept(mediaType(request.acceptFormat()))
          .header("User-Agent", request.userAgent())
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException exception) {
      throw ProviderHttpException.forStatus(request.providerCode(), request.uri(), exception);
    } catch (RestClientException exception) {
      throw new ProviderHttpException(request.providerCode(), request.uri(), "Provider HTTP request failed", exception);
    }
  }

  @Override
  public JsonNode getJson(CatalogHttpRequest request) {
    try {
      return restClient.get()
          .uri(request.uri())
          .accept(mediaType(request.acceptFormat()))
          .header("User-Agent", request.userAgent())
          .retrieve()
          .body(JsonNode.class);
    } catch (RestClientResponseException exception) {
      throw ProviderHttpException.forStatus(request.providerCode(), request.uri(), exception);
    } catch (RestClientException exception) {
      throw new ProviderHttpException(request.providerCode(), request.uri(), "Provider HTTP request failed", exception);
    }
  }

  private MediaType mediaType(CatalogDataFormat format) {
    return format == CatalogDataFormat.JSON || format == CatalogDataFormat.OMM
        ? MediaType.APPLICATION_JSON
        : MediaType.TEXT_PLAIN;
  }
}
