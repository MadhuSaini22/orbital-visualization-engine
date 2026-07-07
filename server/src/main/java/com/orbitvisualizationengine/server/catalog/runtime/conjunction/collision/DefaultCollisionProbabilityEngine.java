package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class DefaultCollisionProbabilityEngine implements CollisionProbabilityEngine {
  private static final double SYMMETRY_TOLERANCE = 1.0e-9;
  private static final double MIN_VARIANCE_METERS_SQUARED = 1.0e-18;

  @Override
  public CollisionProbabilityResult compute(CollisionProbabilityRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("Collision probability request is required");
    }
    if (request.method() != CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE) {
      throw new ConjunctionException("Unsupported collision probability method: " + request.method());
    }

    double[][] primaryCovariance = toMatrix(request.primaryCovarianceMetersSquared(), "Primary covariance matrix");
    double[][] secondaryCovariance = toMatrix(request.secondaryCovarianceMetersSquared(), "Secondary covariance matrix");
    double[][] combinedCovariance = add(primaryCovariance, secondaryCovariance);
    VectorBasis encounterPlane = encounterPlaneBasis(
        request.conjunctionResult().closestApproach().relativeState().relativePosition(),
        request.conjunctionResult().closestApproach().relativeState().relativeVelocity());
    double firstVariance = quadraticForm(encounterPlane.firstAxis(), combinedCovariance);
    double secondVariance = quadraticForm(encounterPlane.secondAxis(), combinedCovariance);
    double combinedEncounterPlaneVariance = Math.max(
        MIN_VARIANCE_METERS_SQUARED,
        (firstVariance + secondVariance) / 2.0);
    double equivalentSigma = Math.sqrt(combinedEncounterPlaneVariance);
    double missDistance = request.conjunctionResult().closestApproach().missDistanceMeters();
    double normalizedMissDistance = missDistance / equivalentSigma;
    double normalizedHardBodyRadius = request.hardBodyRadiusMeters() / equivalentSigma;
    double probability = probability(
        normalizedMissDistance,
        normalizedHardBodyRadius);

    return new CollisionProbabilityResult(
        request,
        probability,
        new CollisionProbabilityStatistics(
            request.method(),
            combinedEncounterPlaneVariance,
            equivalentSigma,
            normalizedMissDistance,
            normalizedHardBodyRadius));
  }

  private static double probability(
      double normalizedMissDistance,
      double normalizedHardBodyRadius) {
    double centerDensity = Math.exp(-0.5 * normalizedMissDistance * normalizedMissDistance);
    double diskProbability = 1.0 - Math.exp(-0.5 * normalizedHardBodyRadius * normalizedHardBodyRadius);
    return Math.max(0.0, Math.min(1.0, centerDensity * diskProbability));
  }

  private static double[][] toMatrix(List<List<Double>> covariance, String name) {
    double[][] matrix = new double[3][3];
    for (int row = 0; row < 3; row++) {
      for (int column = 0; column < 3; column++) {
        matrix[row][column] = covariance.get(row).get(column);
      }
    }
    validateSymmetric(matrix, name);
    validatePositiveSemidefinite(matrix, name);
    return matrix;
  }

  private static void validateSymmetric(double[][] matrix, String name) {
    for (int row = 0; row < 3; row++) {
      for (int column = row + 1; column < 3; column++) {
        if (Math.abs(matrix[row][column] - matrix[column][row]) > SYMMETRY_TOLERANCE) {
          throw new IllegalArgumentException(name + " must be symmetric");
        }
      }
    }
  }

  private static void validatePositiveSemidefinite(double[][] matrix, String name) {
    double[] principalMinors = {
        matrix[0][0],
        matrix[1][1],
        matrix[2][2],
        determinant2(matrix, 0, 1),
        determinant2(matrix, 0, 2),
        determinant2(matrix, 1, 2),
        determinant3(matrix)
    };
    for (double principalMinor : principalMinors) {
      if (principalMinor < -SYMMETRY_TOLERANCE) {
        throw new IllegalArgumentException(name + " must be positive semidefinite");
      }
    }
  }

  private static double determinant2(double[][] matrix, int first, int second) {
    return matrix[first][first] * matrix[second][second]
        - matrix[first][second] * matrix[second][first];
  }

  private static double determinant3(double[][] matrix) {
    return matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
  }

  private static double[][] add(double[][] left, double[][] right) {
    double[][] result = new double[3][3];
    for (int row = 0; row < 3; row++) {
      for (int column = 0; column < 3; column++) {
        result[row][column] = left[row][column] + right[row][column];
      }
    }
    return result;
  }

  private static VectorBasis encounterPlaneBasis(
      CartesianVector relativePosition,
      CartesianVector relativeVelocity) {
    double[] velocity = normalize(vector(relativeVelocity));
    double[] position = vector(relativePosition);
    double alongVelocity = dot(position, velocity);
    double[] firstAxis = subtract(position, scale(velocity, alongVelocity));
    if (norm(firstAxis) <= 1.0e-12) {
      firstAxis = perpendicular(velocity);
    }
    firstAxis = normalize(firstAxis);
    double[] secondAxis = normalize(cross(velocity, firstAxis));
    return new VectorBasis(firstAxis, secondAxis);
  }

  private static double[] perpendicular(double[] vector) {
    double[] reference = Math.abs(vector[0]) < 0.9
        ? new double[] {1.0, 0.0, 0.0}
        : new double[] {0.0, 1.0, 0.0};
    return cross(vector, reference);
  }

  private static double quadraticForm(double[] vector, double[][] matrix) {
    double[] product = new double[3];
    for (int row = 0; row < 3; row++) {
      product[row] = matrix[row][0] * vector[0]
          + matrix[row][1] * vector[1]
          + matrix[row][2] * vector[2];
    }
    return Math.max(0.0, dot(vector, product));
  }

  private static double[] vector(CartesianVector vector) {
    return new double[] {vector.xMeters(), vector.yMeters(), vector.zMeters()};
  }

  private static double[] normalize(double[] vector) {
    double norm = norm(vector);
    if (norm <= 1.0e-12) {
      throw new ConjunctionException("Relative velocity is required for collision probability encounter plane");
    }
    return scale(vector, 1.0 / norm);
  }

  private static double norm(double[] vector) {
    return Math.sqrt(dot(vector, vector));
  }

  private static double dot(double[] left, double[] right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  private static double[] subtract(double[] left, double[] right) {
    return new double[] {
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2]
    };
  }

  private static double[] scale(double[] vector, double scale) {
    return new double[] {
        vector[0] * scale,
        vector[1] * scale,
        vector[2] * scale
    };
  }

  private static double[] cross(double[] left, double[] right) {
    return new double[] {
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    };
  }

  private record VectorBasis(double[] firstAxis, double[] secondAxis) {
  }
}
