package com.orbitvisualizationengine.server.catalog.runtime.conjunction.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import org.springframework.stereotype.Component;

@Component
public class OrekitConjunctionEngine implements ConjunctionEngine {
  @Override
  public ConjunctionResult analyze(
      ConjunctionRequest request,
      RelativeMotionResult relativeMotionResult) {
    try {
      validateInputs(request, relativeMotionResult);
      RelativeState closestState = closestState(relativeMotionResult);
      ClosestApproach closestApproach = new ClosestApproach(
          closestState.timestamp(),
          norm(closestState.relativePosition()),
          norm(closestState.relativeVelocity()),
          closestState);
      ConjunctionStatus status = closestApproach.missDistanceMeters() <= request.missDistanceThresholdMeters()
          ? ConjunctionStatus.CONJUNCTION
          : ConjunctionStatus.CLEAR;
      return new ConjunctionResult(request, closestApproach, status);
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

  private static RelativeState closestState(RelativeMotionResult relativeMotionResult) {
    RelativeState closest = null;
    double closestDistance = Double.POSITIVE_INFINITY;
    for (RelativeState state : relativeMotionResult.states()) {
      double distance = norm(state.relativePosition());
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = state;
      }
    }
    if (closest == null) {
      throw new ConjunctionException("Relative motion result contains no states");
    }
    return closest;
  }

  private static double norm(CartesianVector vector) {
    return Math.sqrt(
        vector.xMeters() * vector.xMeters()
            + vector.yMeters() * vector.yMeters()
            + vector.zMeters() * vector.zMeters());
  }
}
