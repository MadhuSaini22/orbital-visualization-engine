package com.orbitvisualizationengine.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.dto.CreateOrbitRequest;
import com.orbitvisualizationengine.server.propagation.KeplerianPropagator;
import com.orbitvisualizationengine.server.propagation.NumericalPropagator;
import com.orbitvisualizationengine.server.propagation.OrbitPropagator;
import com.orbitvisualizationengine.server.propagation.OrekitOrbitFactory;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.SGP4Propagator;
import com.orbitvisualizationengine.server.propagation.SpacecraftModel;
import com.orbitvisualizationengine.server.repository.ManualOrbitRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.orekit.time.TimeScalesFactory;
import org.springframework.stereotype.Service;

@Service
public class ManualOrbitService {
  private final ManualOrbitRepository manualOrbits;
  private final ObjectMapper mapper;
  private final OrekitOrbitFactory orbitFactory;
  private final SGP4Propagator sgp4Propagator;
  private final KeplerianPropagator keplerianPropagator;
  private final NumericalPropagator numericalPropagator;

  public ManualOrbitService(
      ManualOrbitRepository manualOrbits,
      ObjectMapper mapper,
      OrekitOrbitFactory orbitFactory,
      SGP4Propagator sgp4Propagator,
      KeplerianPropagator keplerianPropagator,
      NumericalPropagator numericalPropagator) {
    this.manualOrbits = manualOrbits;
    this.mapper = mapper;
    this.orbitFactory = orbitFactory;
    this.sgp4Propagator = sgp4Propagator;
    this.keplerianPropagator = keplerianPropagator;
    this.numericalPropagator = numericalPropagator;
  }

  public ManualOrbitRecord create(CreateOrbitRequest request) {
    orbitFactory.validate(request);
    PropagatorType propagatorType = defaultPropagator(request.type(), request.propagatorType());
    validatePropagatorCompatibility(request.type(), propagatorType);
    String payload = payload(request);
    Instant now = Instant.now();
    ManualOrbitRecord orbit = new ManualOrbitRecord(
        "manual-" + UUID.randomUUID(),
        request.name().trim(),
        request.type(),
        request.type() == OrbitDefinitionType.TLE ? orbitFactory.createTle(request.tle()).getDate().toDate(TimeScalesFactory.getUTC()).toInstant() : request.epoch(),
        request.type() == OrbitDefinitionType.TLE ? "TEME" : normalize(request.frame(), "EME2000"),
        normalize(request.centralBody(), "EARTH"),
        payload,
        propagatorType,
        now,
        now);
    return manualOrbits.save(orbit);
  }

  public ManualOrbitRecord get(String orbitId) {
    return manualOrbits.findById(orbitId)
        .orElseThrow(() -> new IllegalArgumentException("Manual orbit " + orbitId + " was not found."));
  }

  public EphemerisState currentState(String orbitId, Instant time, PropagatorType requestedType) {
    ManualOrbitRecord orbit = get(orbitId);
    return selectPropagator(orbit, requestedType).propagate(context(orbit, requestedType), time);
  }

  public List<EphemerisState> propagate(String orbitId, Instant start, Instant end, int stepSeconds, PropagatorType requestedType) {
    ManualOrbitRecord orbit = get(orbitId);
    return selectPropagator(orbit, requestedType).trajectory(context(orbit, requestedType), start, end, stepSeconds);
  }

  public List<String> warnings(ManualOrbitRecord orbit) {
    if (orbit.propagatorType() == PropagatorType.TLE_SGP4 && orbit.type() != OrbitDefinitionType.TLE) {
      return List.of("SGP4 is only available for TLE manual orbits.");
    }
    return List.of();
  }

  private PropagationContext context(ManualOrbitRecord orbit, PropagatorType requestedType) {
    PropagatorType type = requestedType == null ? orbit.propagatorType() : requestedType;
    validatePropagatorCompatibility(orbit.type(), type);
    SatelliteAnalysisConfig config = manualConfig(type, orbit.updatedAt());
    return new PropagationContext(
        0,
        orbitFactory.fromManualOrbit(orbit),
        config,
        SpacecraftModel.fromConfig(config),
        List.of());
  }

  private OrbitPropagator selectPropagator(ManualOrbitRecord orbit, PropagatorType requestedType) {
    PropagatorType type = requestedType == null ? orbit.propagatorType() : requestedType;
    validatePropagatorCompatibility(orbit.type(), type);
    return switch (type) {
      case TLE_SGP4 -> sgp4Propagator;
      case KEPLERIAN -> keplerianPropagator;
      case NUMERICAL -> numericalPropagator;
    };
  }

  private PropagatorType defaultPropagator(OrbitDefinitionType definitionType, PropagatorType requestedType) {
    if (requestedType != null) {
      return requestedType;
    }
    return definitionType == OrbitDefinitionType.TLE ? PropagatorType.TLE_SGP4 : PropagatorType.KEPLERIAN;
  }

  private void validatePropagatorCompatibility(OrbitDefinitionType definitionType, PropagatorType propagatorType) {
    if (propagatorType == PropagatorType.TLE_SGP4 && definitionType != OrbitDefinitionType.TLE) {
      throw new IllegalArgumentException("SGP4 propagation is only supported for TLE orbit definitions.");
    }
  }

  private SatelliteAnalysisConfig manualConfig(PropagatorType type, Instant updatedAt) {
    return new SatelliteAnalysisConfig(
        0,
        AnalysisPreset.FAST_PREVIEW,
        type,
        false,
        2,
        0,
        false,
        false,
        false,
        false,
        false,
        850.0,
        150.0,
        20.0,
        2.2,
        15.0,
        1.2,
        0.2,
        220.0,
        "Manual orbit Phase 1 default propagation configuration.",
        updatedAt);
  }

  private String payload(CreateOrbitRequest request) {
    ObjectNode node = mapper.createObjectNode();
    switch (request.type()) {
      case TLE -> {
        node.put("line1", request.tle().line1().trim());
        node.put("line2", request.tle().line2().trim());
      }
      case CLASSICAL_ELEMENTS -> {
        CreateOrbitRequest.ClassicalElementsDto elements = request.classicalElements();
        node.put("semiMajorAxisKm", elements.semiMajorAxisKm());
        node.put("eccentricity", elements.eccentricity());
        node.put("inclinationDeg", elements.inclinationDeg());
        node.put("raanDeg", elements.raanDeg());
        node.put("argumentOfPeriapsisDeg", elements.argumentOfPeriapsisDeg());
        node.put("trueAnomalyDeg", elements.trueAnomalyDeg());
      }
      case CARTESIAN_STATE -> {
        CreateOrbitRequest.CartesianStateDto state = request.cartesianState();
        node.set("positionKm", mapper.valueToTree(state.positionKm()));
        node.set("velocityKmps", mapper.valueToTree(state.velocityKmps()));
      }
    }
    return node.toString();
  }

  private String normalize(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value.trim().toUpperCase(Locale.ROOT);
  }
}
