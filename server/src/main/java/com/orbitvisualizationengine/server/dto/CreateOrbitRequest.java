package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record CreateOrbitRequest(
    @NotBlank String name,
    @NotNull OrbitDefinitionType type,
    Instant epoch,
    String frame,
    String centralBody,
    TleOrbitDto tle,
    ClassicalElementsDto classicalElements,
    CartesianStateDto cartesianState,
    PropagatorType propagatorType) {

  public record TleOrbitDto(
      @NotBlank String line1,
      @NotBlank String line2) {
  }

  public record ClassicalElementsDto(
      @NotNull Double semiMajorAxisKm,
      @NotNull Double eccentricity,
      @NotNull Double inclinationDeg,
      @NotNull Double raanDeg,
      @NotNull Double argumentOfPeriapsisDeg,
      @NotNull Double trueAnomalyDeg) {
  }

  public record CartesianStateDto(
      @NotNull List<Double> positionKm,
      @NotNull List<Double> velocityKmps) {
  }
}
