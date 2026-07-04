package com.orbitvisualizationengine.server.catalog.provider.dto;

import java.util.List;

public record TleCatalogResponse(List<ProviderTleRecord> records, String rawText) {
  public TleCatalogResponse {
    records = List.copyOf(records);
  }
}
