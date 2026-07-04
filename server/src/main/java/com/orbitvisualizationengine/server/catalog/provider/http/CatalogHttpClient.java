package com.orbitvisualizationengine.server.catalog.provider.http;

import com.fasterxml.jackson.databind.JsonNode;

public interface CatalogHttpClient {
  String getText(CatalogHttpRequest request);

  JsonNode getJson(CatalogHttpRequest request);
}
