package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.propagation.MissionPropagationContextFactory;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import org.springframework.stereotype.Service;

@Service
public class OrekitMissionPropagationContextFactory implements MissionPropagationContextFactory {
  private final OrekitOrbitAnalysisService orbitAnalysis;
  private final ManualOrbitService manualOrbitService;

  public OrekitMissionPropagationContextFactory(
      OrekitOrbitAnalysisService orbitAnalysis,
      ManualOrbitService manualOrbitService) {
    this.orbitAnalysis = orbitAnalysis;
    this.manualOrbitService = manualOrbitService;
  }

  @Override
  public PropagationContext buildLegacyFreeContext(int noradId) {
    return orbitAnalysis.buildContext(noradId, false);
  }

  @Override
  public PropagationContext buildManualOrbitContext(String orbitId) {
    return manualOrbitService.missionPropagationContext(orbitId);
  }
}
