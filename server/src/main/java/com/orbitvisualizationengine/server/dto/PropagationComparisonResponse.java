package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.util.List;

public record PropagationComparisonResponse(
    int noradId,
    String frame,
    List<ModelTrajectory> trajectories) {

  public record ModelTrajectory(String model, List<EphemerisState> states) {
  }
}
