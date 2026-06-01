package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.propagation.MissionPropagationContextFactory;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import org.springframework.stereotype.Service;

@Service
public class OrekitMissionPropagationContextFactory implements MissionPropagationContextFactory {
  private final OrekitOrbitAnalysisService orbitAnalysis;

  public OrekitMissionPropagationContextFactory(OrekitOrbitAnalysisService orbitAnalysis) {
    this.orbitAnalysis = orbitAnalysis;
  }

  @Override
  public PropagationContext buildLegacyFreeContext(int noradId) {
    return orbitAnalysis.buildContext(noradId, false);
  }
}
