package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

public class EclipseException extends RuntimeException {
  public EclipseException(String message) {
    super(message);
  }

  public EclipseException(String message, Throwable cause) {
    super(message, cause);
  }
}
