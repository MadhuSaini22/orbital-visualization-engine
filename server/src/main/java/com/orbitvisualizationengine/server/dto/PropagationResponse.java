package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.util.List;

public record PropagationResponse(
    int noradId,
    String model,
    String frame,
    SatelliteAnalysisConfig analysisConfig,
    List<String> warnings,
    List<EphemerisState> states) {
}
