package com.orbitvisualizationengine.server.catalog.runtime.groundstation.exception;

public class GroundStationRuntimeException extends RuntimeException {
  public GroundStationRuntimeException(String message) {
    super(message);
  }

  public GroundStationRuntimeException(String message, Throwable cause) {
    super(message, cause);
  }
}
