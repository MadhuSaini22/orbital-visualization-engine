package com.orbitvisualizationengine.server.catalog.runtime.conjunction.refinement;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class DefaultClosestApproachRefiner implements ClosestApproachRefiner {
  private static final Duration DEFAULT_REFINEMENT_WINDOW = Duration.ofMinutes(2);
  private static final double MIN_SPEED_SQUARED = 1.0e-18;
  private final Duration refinementWindow;

  public DefaultClosestApproachRefiner() {
    this(DEFAULT_REFINEMENT_WINDOW);
  }

  public DefaultClosestApproachRefiner(Duration refinementWindow) {
    if (refinementWindow == null) {
      throw new IllegalArgumentException("Refinement window is required");
    }
    if (refinementWindow.isZero() || refinementWindow.isNegative()) {
      throw new IllegalArgumentException("Refinement window must be positive");
    }
    this.refinementWindow = refinementWindow;
  }

  @Override
  public ClosestApproachRefinement refine(RelativeMotionResult relativeMotionResult) {
    if (relativeMotionResult == null) {
      throw new ConjunctionException("Relative motion result is required");
    }

    List<RelativeState> states = relativeMotionResult.states();
    int sampledMinimumIndex = sampledMinimumIndex(states);
    RelativeState sampledState = states.get(sampledMinimumIndex);
    double sampledMissDistance = norm(sampledState.relativePosition());
    double sampledRelativeSpeed = norm(sampledState.relativeVelocity());
    ClosestApproach sampledClosestApproach = new ClosestApproach(
        sampledState.timestamp(),
        sampledMissDistance,
        sampledRelativeSpeed,
        sampledState);

    double speedSquared = squaredNorm(sampledState.relativeVelocity());
    if (states.size() == 1 || speedSquared <= MIN_SPEED_SQUARED) {
      return new ClosestApproachRefinement(
          sampledClosestApproach,
          ClosestApproachRefinementStatistics.notRefined(states.size(), sampledMinimumIndex));
    }

    double lowerOffsetSeconds = lowerOffsetSeconds(states, sampledMinimumIndex);
    double upperOffsetSeconds = upperOffsetSeconds(states, sampledMinimumIndex);
    double tcaOffsetSeconds = clamp(
        -dot(sampledState.relativePosition(), sampledState.relativeVelocity()) / speedSquared,
        lowerOffsetSeconds,
        upperOffsetSeconds);
    if (Math.abs(tcaOffsetSeconds) <= 1.0e-12) {
      return new ClosestApproachRefinement(
          sampledClosestApproach,
          ClosestApproachRefinementStatistics.notRefined(states.size(), sampledMinimumIndex));
    }

    RelativeState refinedState = interpolate(sampledState, tcaOffsetSeconds);
    ClosestApproach refinedClosestApproach = new ClosestApproach(
        refinedState.timestamp(),
        norm(refinedState.relativePosition()),
        norm(refinedState.relativeVelocity()),
        refinedState);
    return new ClosestApproachRefinement(
        refinedClosestApproach,
        new ClosestApproachRefinementStatistics(
            states.size(),
            sampledMinimumIndex,
            true,
            tcaOffsetSeconds));
  }

  private int sampledMinimumIndex(List<RelativeState> states) {
    int closestIndex = -1;
    double closestDistance = Double.POSITIVE_INFINITY;
    for (int index = 0; index < states.size(); index++) {
      double distance = norm(states.get(index).relativePosition());
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    if (closestIndex < 0) {
      throw new ConjunctionException("Relative motion result contains no states");
    }
    return closestIndex;
  }

  private double lowerOffsetSeconds(List<RelativeState> states, int sampledMinimumIndex) {
    double lowerOffset = -refinementWindow.toNanos() / 1.0e9;
    if (sampledMinimumIndex > 0) {
      lowerOffset = Math.max(
          lowerOffset,
          secondsBetween(states.get(sampledMinimumIndex).timestamp(), states.get(sampledMinimumIndex - 1).timestamp()));
    }
    return Math.min(lowerOffset, 0.0);
  }

  private double upperOffsetSeconds(List<RelativeState> states, int sampledMinimumIndex) {
    double upperOffset = refinementWindow.toNanos() / 1.0e9;
    if (sampledMinimumIndex < states.size() - 1) {
      upperOffset = Math.min(
          upperOffset,
          secondsBetween(states.get(sampledMinimumIndex).timestamp(), states.get(sampledMinimumIndex + 1).timestamp()));
    }
    return Math.max(upperOffset, 0.0);
  }

  private static RelativeState interpolate(RelativeState sampledState, double offsetSeconds) {
    CartesianVector position = sampledState.relativePosition();
    CartesianVector velocity = sampledState.relativeVelocity();
    return new RelativeState(
        plusSeconds(sampledState.timestamp(), offsetSeconds),
        sampledState.frame(),
        new CartesianVector(
            position.xMeters() + velocity.xMeters() * offsetSeconds,
            position.yMeters() + velocity.yMeters() * offsetSeconds,
            position.zMeters() + velocity.zMeters() * offsetSeconds),
        velocity);
  }

  private static Instant plusSeconds(Instant instant, double seconds) {
    long wholeSeconds = (long) seconds;
    long nanos = Math.round((seconds - wholeSeconds) * 1.0e9);
    return instant.plusSeconds(wholeSeconds).plusNanos(nanos);
  }

  private static double secondsBetween(Instant reference, Instant target) {
    return Duration.between(reference, target).toNanos() / 1.0e9;
  }

  private static double clamp(double value, double lower, double upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  private static double dot(CartesianVector left, CartesianVector right) {
    return left.xMeters() * right.xMeters()
        + left.yMeters() * right.yMeters()
        + left.zMeters() * right.zMeters();
  }

  private static double norm(CartesianVector vector) {
    return Math.sqrt(squaredNorm(vector));
  }

  private static double squaredNorm(CartesianVector vector) {
    return vector.xMeters() * vector.xMeters()
        + vector.yMeters() * vector.yMeters()
        + vector.zMeters() * vector.zMeters();
  }
}
