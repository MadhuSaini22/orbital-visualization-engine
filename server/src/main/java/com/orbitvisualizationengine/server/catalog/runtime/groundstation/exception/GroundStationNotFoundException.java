package com.orbitvisualizationengine.server.catalog.runtime.groundstation.exception;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;

public class GroundStationNotFoundException extends GroundStationRuntimeException {
  public GroundStationNotFoundException(GroundStationId id) {
    super("No runtime ground station exists for id " + id.value());
  }
}
