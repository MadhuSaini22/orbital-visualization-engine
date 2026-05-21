package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Instant;
import java.util.List;

public interface OrbitAnalysisService {
  List<EphemerisState> propagate(int noradId, Instant start, Instant end, int stepSeconds);

  EphemerisState currentState(int noradId, Instant time);
}
