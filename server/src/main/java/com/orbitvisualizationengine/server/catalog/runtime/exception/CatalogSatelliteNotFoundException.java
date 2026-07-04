package com.orbitvisualizationengine.server.catalog.runtime.exception;

public class CatalogSatelliteNotFoundException extends CatalogRuntimeException {
  public CatalogSatelliteNotFoundException(int noradCatalogId) {
    super("No published catalog satellite exists for NORAD catalog id " + noradCatalogId);
  }
}
