package com.orbitvisualizationengine.server.catalog.provider.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record ProviderTleRecord(
    String objectName,
    int noradCatalogId,
    String line1,
    String line2,
    JsonNode rawPayload) {
}
