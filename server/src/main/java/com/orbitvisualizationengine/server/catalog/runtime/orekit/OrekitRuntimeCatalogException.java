package com.orbitvisualizationengine.server.catalog.runtime.orekit;

public class OrekitRuntimeCatalogException extends RuntimeException {
  public OrekitRuntimeCatalogException(String message) {
    super(message);
  }

  public OrekitRuntimeCatalogException(String message, Throwable cause) {
    super(message, cause);
  }
}
