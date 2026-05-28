package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.util.List;

public record AnalysisConfigResponse(
    SatelliteAnalysisConfig config,
    List<String> activeModes,
    List<String> warnings) {
}
