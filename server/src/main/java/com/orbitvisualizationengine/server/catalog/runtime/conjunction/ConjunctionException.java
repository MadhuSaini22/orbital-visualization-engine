package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

public class ConjunctionException extends RuntimeException {
  public ConjunctionException(String message) {
    super(message);
  }

  public ConjunctionException(String message, Throwable cause) {
    super(message, cause);
  }
}
