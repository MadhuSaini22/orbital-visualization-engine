package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.exception.GroundStationNotFoundException;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository.GroundStationRepository;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class GroundStationService {
  private final GroundStationRepository repository;

  public GroundStationService(GroundStationRepository repository) {
    this.repository = repository;
  }

  public GroundStation findById(GroundStationId id) {
    GroundStationId validatedId = validateId(id);
    return repository.findById(validatedId)
        .orElseThrow(() -> new GroundStationNotFoundException(validatedId));
  }

  public List<GroundStation> findAll() {
    return List.copyOf(repository.findAll());
  }

  public boolean exists(GroundStationId id) {
    return repository.exists(validateId(id));
  }

  public Stream<GroundStation> stream() {
    return repository.stream();
  }

  private static GroundStationId validateId(GroundStationId id) {
    if (id == null) {
      throw new IllegalArgumentException("Ground station id is required");
    }
    return id;
  }
}
