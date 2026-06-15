package com.orbitvisualizationengine.server.service;

import java.util.List;

public record DifferentialCorrectorCapability(
    String status,
    String solverApproach,
    List<String> supportedControlVariables,
    List<String> supportedAchieveVariables,
    List<String> requiredOrekitFoundation
) {
}
