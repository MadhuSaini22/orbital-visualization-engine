package com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

public interface GroundStationRepository {
  Optional<GroundStation> findById(GroundStationId id);

  List<GroundStation> findAll();

  boolean exists(GroundStationId id);

  Stream<GroundStation> stream();
}
