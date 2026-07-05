package com.orbitvisualizationengine.server.catalog.runtime.propagation;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.time.Instant;
import java.util.List;

public interface PropagationEngine {
  List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes);
}
