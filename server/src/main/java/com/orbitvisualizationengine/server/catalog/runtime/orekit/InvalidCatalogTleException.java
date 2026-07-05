package com.orbitvisualizationengine.server.catalog.runtime.orekit;

public class InvalidCatalogTleException extends OrekitRuntimeCatalogException {
  public InvalidCatalogTleException(int noradCatalogId, String message) {
    super("Catalog satellite " + noradCatalogId + " has an invalid TLE: " + message);
  }

  public InvalidCatalogTleException(int noradCatalogId, String message, Throwable cause) {
    super("Catalog satellite " + noradCatalogId + " has an invalid TLE: " + message, cause);
  }
}
