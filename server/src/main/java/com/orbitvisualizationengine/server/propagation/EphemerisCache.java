package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class EphemerisCache {
  private final ConcurrentHashMap<Key, List<EphemerisState>> trajectories = new ConcurrentHashMap<>();

  public Optional<List<EphemerisState>> get(
      int noradId,
      String model,
      SatelliteAnalysisConfig config,
      Instant start,
      Instant end,
      int stepSeconds) {
    return Optional.ofNullable(trajectories.get(key(noradId, model, config, start, end, stepSeconds)));
  }

  public List<EphemerisState> put(
      int noradId,
      String model,
      SatelliteAnalysisConfig config,
      Instant start,
      Instant end,
      int stepSeconds,
      List<EphemerisState> states) {
    trajectories.put(key(noradId, model, config, start, end, stepSeconds), List.copyOf(states));
    return states;
  }

  private Key key(
      int noradId,
      String model,
      SatelliteAnalysisConfig config,
      Instant start,
      Instant end,
      int stepSeconds) {
    return new Key(
        noradId,
        model,
        config.updatedAt(),
        start,
        end,
        stepSeconds);
  }

  private record Key(
      int noradId,
      String model,
      Instant configUpdatedAt,
      Instant start,
      Instant end,
      int stepSeconds) {
  }
}
