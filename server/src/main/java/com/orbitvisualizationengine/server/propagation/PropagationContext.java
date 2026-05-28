package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.util.List;
import org.orekit.propagation.analytical.tle.TLE;

public record PropagationContext(
    int noradId,
    TLE tle,
    SatelliteAnalysisConfig analysisConfig,
    SpacecraftModel spacecraft,
    List<ManeuverEvent> maneuvers) {
}
