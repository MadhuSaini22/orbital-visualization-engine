package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.util.List;

public record MissionTrajectoryResult(
    String model,
    SatelliteAnalysisConfig analysisConfig,
    List<EphemerisState> states) {
}
