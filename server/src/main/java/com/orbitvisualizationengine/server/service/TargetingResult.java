package com.orbitvisualizationengine.server.service;

import java.util.List;
import java.util.Map;

public record TargetingResult(
    String status,
    List<ControlVariable> controls,
    List<AchieveVariable> objectives,
    List<TargetingIteration> iterations,
    Map<String, Double> finalResiduals,
    List<String> notes
) {
}
