package com.orbitvisualizationengine.server.catalog.runtime.propagation;

public class PropagationException extends RuntimeException {
  public PropagationException(String message) {
    super(message);
  }

  public PropagationException(String message, Throwable cause) {
    super(message, cause);
  }
}
