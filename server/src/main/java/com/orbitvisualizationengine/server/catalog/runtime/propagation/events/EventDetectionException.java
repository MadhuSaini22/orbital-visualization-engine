package com.orbitvisualizationengine.server.catalog.runtime.propagation.events;

public class EventDetectionException extends RuntimeException {
  public EventDetectionException(String message) {
    super(message);
  }

  public EventDetectionException(String message, Throwable cause) {
    super(message, cause);
  }
}
