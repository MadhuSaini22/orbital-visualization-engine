package com.orbitvisualizationengine.server.catalog.runtime.relativemotion.orekit;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionException;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.util.ArrayList;
import java.util.List;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.springframework.stereotype.Component;

@Component
public class OrekitRelativeMotionEngine implements RelativeMotionEngine {
  @Override
  public RelativeMotionResult computeRelativeMotion(
      RelativeMotionRequest request,
      PropagationResult primaryPropagation,
      PropagationResult secondaryPropagation) {
    try {
      validateInputs(request, primaryPropagation, secondaryPropagation);
      List<RelativeState> states = new ArrayList<>();
      for (int i = 0; i < primaryPropagation.states().size(); i++) {
        PropagatedState primary = primaryPropagation.states().get(i);
        PropagatedState secondary = secondaryPropagation.states().get(i);
        states.add(relativeState(request.frame(), primary, secondary));
      }
      return new RelativeMotionResult(request, states);
    } catch (RelativeMotionException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw new RelativeMotionException("Unable to compute relative motion", exception);
    }
  }

  private static void validateInputs(
      RelativeMotionRequest request,
      PropagationResult primaryPropagation,
      PropagationResult secondaryPropagation) {
    if (request == null) {
      throw new RelativeMotionException("Relative motion request is required");
    }
    if (primaryPropagation == null) {
      throw new RelativeMotionException("Primary propagation result is required");
    }
    if (secondaryPropagation == null) {
      throw new RelativeMotionException("Secondary propagation result is required");
    }
    if (primaryPropagation.states().size() != secondaryPropagation.states().size()) {
      throw new RelativeMotionException("Primary and secondary propagation samples must have the same size");
    }
    if (request.frame() != RelativeFrame.LVLH_RTN) {
      throw new RelativeMotionException("Unsupported relative frame: " + request.frame());
    }
    for (int i = 0; i < primaryPropagation.states().size(); i++) {
      if (!primaryPropagation.states().get(i).timestamp().equals(secondaryPropagation.states().get(i).timestamp())) {
        throw new RelativeMotionException("Primary and secondary propagation sample times must match");
      }
    }
  }

  private static RelativeState relativeState(
      RelativeFrame frame,
      PropagatedState primary,
      PropagatedState secondary) {
    Vector3D primaryPosition = vector(primary.position());
    Vector3D primaryVelocity = vector(primary.velocity());
    Vector3D secondaryPosition = vector(secondary.position());
    Vector3D secondaryVelocity = vector(secondary.velocity());

    Vector3D radial = unit(primaryPosition, "primary position");
    Vector3D crossTrack = unit(primaryPosition.crossProduct(primaryVelocity), "primary angular momentum");
    Vector3D inTrack = crossTrack.crossProduct(radial);

    Vector3D relativePositionInertial = secondaryPosition.subtract(primaryPosition);
    Vector3D relativeVelocityInertial = secondaryVelocity.subtract(primaryVelocity);
    Vector3D frameRate = crossTrack.scalarMultiply(
        primaryPosition.crossProduct(primaryVelocity).getNorm() / primaryPosition.getNormSq());
    Vector3D relativeVelocityRotating = relativeVelocityInertial.subtract(
        frameRate.crossProduct(relativePositionInertial));

    return new RelativeState(
        primary.timestamp(),
        frame,
        project(relativePositionInertial, radial, inTrack, crossTrack),
        project(relativeVelocityRotating, radial, inTrack, crossTrack));
  }

  private static CartesianVector project(
      Vector3D vector,
      Vector3D radial,
      Vector3D inTrack,
      Vector3D crossTrack) {
    return new CartesianVector(
        vector.dotProduct(radial),
        vector.dotProduct(inTrack),
        vector.dotProduct(crossTrack));
  }

  private static Vector3D unit(Vector3D vector, String description) {
    double norm = vector.getNorm();
    if (norm == 0.0 || !Double.isFinite(norm)) {
      throw new RelativeMotionException("Cannot build LVLH/RTN frame from invalid " + description);
    }
    return vector.scalarMultiply(1.0 / norm);
  }

  private static Vector3D vector(CartesianVector vector) {
    return new Vector3D(vector.xMeters(), vector.yMeters(), vector.zMeters());
  }
}
