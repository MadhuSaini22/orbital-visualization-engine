package com.orbitvisualizationengine.server.catalog.runtime.conjunction.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement.ClosestApproachRefinement;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement.ClosestApproachRefiner;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import org.springframework.stereotype.Component;

@Component
public class OrekitConjunctionEngine implements ConjunctionEngine {
  private final ClosestApproachRefiner closestApproachRefiner;

  public OrekitConjunctionEngine(ClosestApproachRefiner closestApproachRefiner) {
    this.closestApproachRefiner = closestApproachRefiner;
  }

  @Override
  public ConjunctionResult analyze(
      ConjunctionRequest request,
      RelativeMotionResult relativeMotionResult) {
    try {
      validateInputs(request, relativeMotionResult);
      ClosestApproachRefinement refinement = closestApproachRefiner.refine(relativeMotionResult);
      ConjunctionStatus status = refinement.closestApproach().missDistanceMeters() <= request.missDistanceThresholdMeters()
          ? ConjunctionStatus.CONJUNCTION
          : ConjunctionStatus.CLEAR;
      return new ConjunctionResult(
          request,
          refinement.closestApproach(),
          status,
          refinement.statistics());
    } catch (ConjunctionException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw new ConjunctionException("Unable to analyze conjunction", exception);
    }
  }

  private static void validateInputs(
      ConjunctionRequest request,
      RelativeMotionResult relativeMotionResult) {
    if (request == null) {
      throw new ConjunctionException("Conjunction request is required");
    }
    if (relativeMotionResult == null) {
      throw new ConjunctionException("Relative motion result is required");
    }
  }
}
