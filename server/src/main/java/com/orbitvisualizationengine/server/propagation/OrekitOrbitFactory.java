package com.orbitvisualizationengine.server.propagation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.dto.CreateOrbitRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.orekit.frames.Frame;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.PositionAngleType;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;
import org.springframework.stereotype.Component;

@Component
public class OrekitOrbitFactory {
  private static final double EARTH_RADIUS_KM = Constants.WGS84_EARTH_EQUATORIAL_RADIUS / 1000.0;

  private final OrekitEnvironment orekit;
  private final ObjectMapper mapper;

  public OrekitOrbitFactory(OrekitEnvironment orekit, ObjectMapper mapper) {
    this.orekit = orekit;
    this.mapper = mapper;
  }

  public OrbitSeed fromManualOrbit(ManualOrbitRecord orbit) {
    try {
      JsonNode payload = mapper.readTree(orbit.payload());
      if (orbit.type() == OrbitDefinitionType.TLE) {
        return OrbitSeed.tle(new TLE(
            payload.path("line1").asText(),
            payload.path("line2").asText()));
      }
      if (orbit.type() == OrbitDefinitionType.CLASSICAL_ELEMENTS) {
        return new OrbitSeed(
            OrbitDefinitionType.CLASSICAL_ELEMENTS,
            orbit.epoch(),
            orbit.frame(),
            orbit.centralBody(),
            null,
            classicalOrbit(payload, orbit.epoch(), orbit.frame()));
      }
      if (orbit.type() == OrbitDefinitionType.CARTESIAN_STATE) {
        return new OrbitSeed(
            OrbitDefinitionType.CARTESIAN_STATE,
            orbit.epoch(),
            orbit.frame(),
            orbit.centralBody(),
            null,
            cartesianOrbit(payload, orbit.epoch(), orbit.frame()));
      }
      throw new IllegalArgumentException("Unsupported manual orbit type: " + orbit.type());
    } catch (IllegalArgumentException exception) {
      throw exception;
    } catch (RuntimeException | java.io.IOException exception) {
      throw new IllegalArgumentException("Manual orbit payload could not be converted to an Orekit orbit", exception);
    }
  }

  public void validate(CreateOrbitRequest request) {
    String name = request.name() == null ? "" : request.name().trim();
    if (name.isBlank()) {
      throw new IllegalArgumentException("Orbit name is required.");
    }
    if (request.type() == null) {
      throw new IllegalArgumentException("Orbit definition type is required.");
    }
    if (request.type() == OrbitDefinitionType.TLE) {
      validateTle(request.tle());
      return;
    }
    if (request.type() == OrbitDefinitionType.CLASSICAL_ELEMENTS) {
      validateClassical(request);
      return;
    }
    if (request.type() == OrbitDefinitionType.CARTESIAN_STATE) {
      validateCartesian(request);
      return;
    }
    throw new IllegalArgumentException("Unsupported orbit definition type: " + request.type());
  }

  public TLE createTle(CreateOrbitRequest.TleOrbitDto tle) {
    validateTle(tle);
    return new TLE(tle.line1().trim(), tle.line2().trim());
  }

  private void validateTle(CreateOrbitRequest.TleOrbitDto tle) {
    if (tle == null) {
      throw new IllegalArgumentException("TLE payload is required.");
    }
    String line1 = tle.line1() == null ? "" : tle.line1().trim();
    String line2 = tle.line2() == null ? "" : tle.line2().trim();
    if (line1.isBlank() || line2.isBlank()) {
      throw new IllegalArgumentException("TLE line 1 and line 2 are required.");
    }
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      throw new IllegalArgumentException("TLE lines must start with '1 ' and '2 '.");
    }
    if (line1.length() < 7 || line2.length() < 7 || !line1.substring(2, 7).equals(line2.substring(2, 7))) {
      throw new IllegalArgumentException("TLE satellite numbers must match.");
    }
    try {
      new TLE(line1, line2);
    } catch (RuntimeException exception) {
      throw new IllegalArgumentException("TLE is not valid: " + exception.getMessage(), exception);
    }
  }

  private void validateClassical(CreateOrbitRequest request) {
    requireManualEpochAndFrame(request);
    CreateOrbitRequest.ClassicalElementsDto elements = request.classicalElements();
    if (elements == null) {
      throw new IllegalArgumentException("Classical elements payload is required.");
    }
    requireFinite(elements.semiMajorAxisKm(), "Semi-major axis");
    requireFinite(elements.eccentricity(), "Eccentricity");
    requireFinite(elements.inclinationDeg(), "Inclination");
    requireFinite(elements.raanDeg(), "RAAN");
    requireFinite(elements.argumentOfPeriapsisDeg(), "Argument of periapsis");
    requireFinite(elements.trueAnomalyDeg(), "True anomaly");
    if (elements.semiMajorAxisKm() <= EARTH_RADIUS_KM) {
      throw new IllegalArgumentException("Semi-major axis must be greater than Earth radius.");
    }
    if (elements.eccentricity() < 0.0 || elements.eccentricity() >= 1.0) {
      throw new IllegalArgumentException("Eccentricity must be in the range [0, 1).");
    }
    requireRange(elements.inclinationDeg(), 0.0, 180.0, "Inclination");
    requireAngle(elements.raanDeg(), "RAAN");
    requireAngle(elements.argumentOfPeriapsisDeg(), "Argument of periapsis");
    requireAngle(elements.trueAnomalyDeg(), "True anomaly");
  }

  private void validateCartesian(CreateOrbitRequest request) {
    requireManualEpochAndFrame(request);
    CreateOrbitRequest.CartesianStateDto state = request.cartesianState();
    if (state == null) {
      throw new IllegalArgumentException("Cartesian state payload is required.");
    }
    double[] position = vector(state.positionKm(), "Position");
    double[] velocity = vector(state.velocityKmps(), "Velocity");
    double radiusKm = Math.sqrt(position[0] * position[0] + position[1] * position[1] + position[2] * position[2]);
    double speedKmps = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]);
    if (radiusKm <= EARTH_RADIUS_KM) {
      throw new IllegalArgumentException("Position magnitude must be greater than Earth radius.");
    }
    if (speedKmps <= 0.0) {
      throw new IllegalArgumentException("Velocity magnitude must be greater than zero.");
    }
  }

  private void requireManualEpochAndFrame(CreateOrbitRequest request) {
    if (request.epoch() == null) {
      throw new IllegalArgumentException("Epoch is required.");
    }
    if (!"EME2000".equalsIgnoreCase(normalizeFrame(request.frame()))) {
      throw new IllegalArgumentException("Manual Phase 1 orbits support EME2000 frame only.");
    }
    String centralBody = request.centralBody() == null ? "EARTH" : request.centralBody().trim();
    if (!"EARTH".equalsIgnoreCase(centralBody)) {
      throw new IllegalArgumentException("Manual Phase 1 orbits support Earth-centered definitions only.");
    }
  }

  private Orbit classicalOrbit(JsonNode payload, Instant epoch, String frame) {
    return new KeplerianOrbit(
        payload.path("semiMajorAxisKm").asDouble() * 1000.0,
        payload.path("eccentricity").asDouble(),
        Math.toRadians(payload.path("inclinationDeg").asDouble()),
        Math.toRadians(payload.path("argumentOfPeriapsisDeg").asDouble()),
        Math.toRadians(payload.path("raanDeg").asDouble()),
        Math.toRadians(payload.path("trueAnomalyDeg").asDouble()),
        PositionAngleType.TRUE,
        frame(frame),
        OrekitStateMapper.toAbsoluteDate(epoch),
        Constants.EGM96_EARTH_MU);
  }

  private Orbit cartesianOrbit(JsonNode payload, Instant epoch, String frame) {
    JsonNode position = payload.path("positionKm");
    JsonNode velocity = payload.path("velocityKmps");
    PVCoordinates pv = new PVCoordinates(
        new Vector3D(position.get(0).asDouble() * 1000.0, position.get(1).asDouble() * 1000.0, position.get(2).asDouble() * 1000.0),
        new Vector3D(velocity.get(0).asDouble() * 1000.0, velocity.get(1).asDouble() * 1000.0, velocity.get(2).asDouble() * 1000.0));
    return new CartesianOrbit(pv, frame(frame), OrekitStateMapper.toAbsoluteDate(epoch), Constants.EGM96_EARTH_MU);
  }

  private Frame frame(String frame) {
    String normalized = normalizeFrame(frame);
    if ("EME2000".equals(normalized)) {
      return orekit.eme2000();
    }
    throw new IllegalArgumentException("Unsupported manual orbit frame: " + frame);
  }

  private String normalizeFrame(String frame) {
    if (frame == null || frame.isBlank()) {
      return "EME2000";
    }
    return frame.trim().toUpperCase(Locale.ROOT);
  }

  private void requireFinite(Double value, String label) {
    if (value == null || !Double.isFinite(value)) {
      throw new IllegalArgumentException(label + " must be a finite number.");
    }
  }

  private void requireAngle(Double value, String label) {
    requireRange(value, 0.0, 360.0, label);
  }

  private void requireRange(Double value, double min, double max, String label) {
    requireFinite(value, label);
    if (value < min || value > max) {
      throw new IllegalArgumentException(label + " must be between " + min + " and " + max + ".");
    }
  }

  private double[] vector(List<Double> values, String label) {
    if (values == null || values.size() != 3) {
      throw new IllegalArgumentException(label + " vector must contain exactly 3 values.");
    }
    double[] output = new double[3];
    for (int index = 0; index < values.size(); index++) {
      Double value = values.get(index);
      if (value == null || !Double.isFinite(value)) {
        throw new IllegalArgumentException(label + " vector values must be finite numbers.");
      }
      output[index] = value;
    }
    return output;
  }
}
