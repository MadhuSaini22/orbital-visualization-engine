package com.orbitvisualizationengine.server.catalog.provider;

import java.util.Map;

public record CatalogFetchRequest(
    CatalogEndpoint endpoint,
    CatalogDataFormat expectedFormat,
    Map<String, ?> pathParameters,
    Map<String, ?> queryParameters) {

  public CatalogFetchRequest {
    pathParameters = pathParameters == null ? Map.of() : Map.copyOf(pathParameters);
    queryParameters = queryParameters == null ? Map.of() : Map.copyOf(queryParameters);
  }
}
