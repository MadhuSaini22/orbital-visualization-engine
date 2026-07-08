package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.dto.CreateOrbitRequest;

public record RuntimeObjectRef(
    RuntimeObjectType type,
    Integer noradCatalogId,
    String orbitId,
    CreateOrbitRequest orbitDefinition) {
  public RuntimeObjectRef {
    if (type == null) {
      throw new IllegalArgumentException("Runtime object type is required");
    }
    switch (type) {
      case CATALOG_NORAD -> {
        if (noradCatalogId == null || noradCatalogId <= 0) {
          throw new IllegalArgumentException("Catalog NORAD id must be positive");
        }
      }
      case MANUAL_ORBIT -> {
        if ((orbitId == null || orbitId.isBlank()) && orbitDefinition == null) {
          throw new IllegalArgumentException("Orbit id or orbit definition is required");
        }
        if (orbitId != null) {
          orbitId = orbitId.trim();
        }
      }
    }
  }
}
