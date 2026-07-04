package com.orbitvisualizationengine.server.catalog.provider.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record CelestrakGpCatalogResponse(
    List<CelestrakGpElement> records,
    JsonNode rawPayload) {

  public CelestrakGpCatalogResponse {
    records = List.copyOf(records);
  }
}
