package com.orbitvisualizationengine.server.api;

public record RuntimeObjectRef(
    RuntimeObjectType type,
    Integer noradCatalogId,
    String orbitId) {
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
        if (orbitId == null || orbitId.isBlank()) {
          throw new IllegalArgumentException("Orbit id is required");
        }
        orbitId = orbitId.trim();
      }
    }
  }
}
