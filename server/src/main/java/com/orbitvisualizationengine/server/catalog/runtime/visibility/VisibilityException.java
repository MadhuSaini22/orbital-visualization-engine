package com.orbitvisualizationengine.server.catalog.runtime.visibility;

public class VisibilityException extends RuntimeException {
  public VisibilityException(String message) {
    super(message);
  }

  public VisibilityException(String message, Throwable cause) {
    super(message, cause);
  }
}
