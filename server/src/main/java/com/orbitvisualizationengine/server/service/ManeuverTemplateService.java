package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.ManeuverTemplateType;
import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.dto.CreateTimelineEventRequest;
import com.orbitvisualizationengine.server.dto.ManeuverTemplateApplyResponse;
import com.orbitvisualizationengine.server.dto.ManeuverTemplatePreview;
import com.orbitvisualizationengine.server.dto.ManeuverTemplateRequest;
import com.orbitvisualizationengine.server.dto.MissionTimelineEventResponse;
import com.orbitvisualizationengine.server.propagation.MissionPropagationContextFactory;
import com.orbitvisualizationengine.server.propagation.OrekitEnvironment;
import com.orbitvisualizationengine.server.propagation.OrekitStateMapper;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.KeplerianPropagator;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManeuverTemplateService {
  private static final double EARTH_RADIUS_KM = Constants.WGS84_EARTH_EQUATORIAL_RADIUS / 1000.0;
  private static final double MU = Constants.EGM96_EARTH_MU;
  private static final double SMALL_ECCENTRICITY = 1.0e-6;
  private static final double INTERSECTION_TOLERANCE_KM = 1.0;

  private final MissionService missions;
  private final MissionTimelineService timeline;
  private final MissionPropagationContextFactory contextFactory;
  private final OrekitEnvironment orekit;

  public ManeuverTemplateService(
      MissionService missions,
      MissionTimelineService timeline,
      MissionPropagationContextFactory contextFactory,
      OrekitEnvironment orekit) {
    this.missions = missions;
    this.timeline = timeline;
    this.contextFactory = contextFactory;
    this.orekit = orekit;
  }

  public ManeuverTemplatePreview preview(String missionId, ManeuverTemplateRequest request) {
    Mission mission = missions.get(missionId);
    validateRequest(request);
    String templateInstanceId = "template-instance-" + UUID.randomUUID();
    Orbit orbit = orbitAtMissionStart(mission);
    int sequenceIndex = request.sequenceIndex() == null
        ? timeline.list(missionId).size()
        : request.sequenceIndex();
    return switch (request.type()) {
      case CIRCULARIZATION -> circularizationPreview(mission, request, orbit, templateInstanceId, sequenceIndex);
      case HOHMANN_TRANSFER -> hohmannPreview(mission, request, orbit, templateInstanceId, sequenceIndex);
    };
  }

  @Transactional
  public ManeuverTemplateApplyResponse apply(String missionId, ManeuverTemplateRequest request) {
    ManeuverTemplatePreview preview = preview(missionId, request);
    List<MissionTimelineEvent> created = new ArrayList<>();
    for (CreateTimelineEventRequest event : preview.events()) {
      created.add(timeline.create(missionId, event));
    }
    return new ManeuverTemplateApplyResponse(
        preview.type(),
        preview.templateInstanceId(),
        preview.metadata(),
        preview.warnings(),
        created.stream().map(MissionTimelineEventResponse::from).toList());
  }

  private ManeuverTemplatePreview circularizationPreview(
      Mission mission,
      ManeuverTemplateRequest request,
      Orbit orbit,
      String templateInstanceId,
      int sequenceIndex) {
    KeplerianOrbit keplerian = new KeplerianOrbit(orbit);
    double targetRadiusMeters = radiusMeters(request.targetAltitudeKm());
    CircularizationPoint point = circularizationPoint(keplerian, targetRadiusMeters);
    Instant burnTime = mission.scenarioStart().plusSeconds(Math.max(0, Math.round(point.coastSeconds())));
    List<String> warnings = new ArrayList<>(point.warnings());
    warnIfOutsideMission(mission, burnTime, "Circularization burn", warnings);

    double burnRadiusMeters = point.radiusMeters();
    double burnSpeedMps = speedAtRadius(keplerian.getA(), burnRadiusMeters);
    double circularSpeedMps = Math.sqrt(MU / burnRadiusMeters);
    double deltaVMps = circularSpeedMps - burnSpeedMps;

    Map<String, Object> metadata = templateMetadata(templateInstanceId, request.type(), "SUMMARY");
    metadata.put("targetAltitudeKm", request.targetAltitudeKm());
    metadata.put("burnRadiusKm", burnRadiusMeters / 1000.0);
    metadata.put("burnMagnitudeMps", Math.abs(deltaVMps));
    metadata.put("totalDeltaVMps", Math.abs(deltaVMps));
    metadata.put("coastSeconds", point.coastSeconds());

    List<CreateTimelineEventRequest> events = new ArrayList<>();
    if (point.coastSeconds() > 1.0) {
      events.add(new CreateTimelineEventRequest(
          sequenceIndex++,
          TimelineEventType.COAST,
          "Circularization Coast",
          true,
          mission.scenarioStart(),
          withSchedule(templateMetadata(templateInstanceId, request.type(), "COAST"), mission, mission.scenarioStart())));
    }
    Map<String, Object> burnMetadata = withSchedule(
        templateMetadata(templateInstanceId, request.type(), "CIRCULARIZATION_BURN"),
        mission,
        burnTime);
    burnMetadata.put("targetAltitudeKm", request.targetAltitudeKm());
    burnMetadata.put("computedDeltaVMps", Math.abs(deltaVMps));
    if (Math.abs(deltaVMps) < 1.0e-9) {
      burnMetadata.put("noBurnRequired", true);
      warnings.add("Circularization delta-v is effectively zero; generated burn is disabled.");
    }
    events.add(new CreateTimelineEventRequest(
        sequenceIndex,
        TimelineEventType.IMPULSIVE_BURN,
        "Circularization Burn",
        Math.abs(deltaVMps) >= 1.0e-9,
        burnTime,
        impulsiveParameters(burnMetadata, signedTangentialDeltaV(deltaVMps))));

    return new ManeuverTemplatePreview(request.type(), templateInstanceId, metadata, warnings, events);
  }

  private ManeuverTemplatePreview hohmannPreview(
      Mission mission,
      ManeuverTemplateRequest request,
      Orbit orbit,
      String templateInstanceId,
      int sequenceIndex) {
    double initialRadiusMeters = orbit.getPosition().getNorm();
    double targetRadiusMeters = radiusMeters(request.targetAltitudeKm());
    if (Math.abs(targetRadiusMeters - initialRadiusMeters) < 1.0) {
      throw new IllegalArgumentException("Target altitude must differ from the current orbital radius for a Hohmann transfer.");
    }

    double transferSemiMajorAxisMeters = (initialRadiusMeters + targetRadiusMeters) / 2.0;
    double circularSpeedInitial = Math.sqrt(MU / initialRadiusMeters);
    double circularSpeedTarget = Math.sqrt(MU / targetRadiusMeters);
    double transferPeriapsisSpeed = Math.sqrt(MU * ((2.0 / initialRadiusMeters) - (1.0 / transferSemiMajorAxisMeters)));
    double transferApoapsisSpeed = Math.sqrt(MU * ((2.0 / targetRadiusMeters) - (1.0 / transferSemiMajorAxisMeters)));
    double deltaV1Mps = transferPeriapsisSpeed - circularSpeedInitial;
    double deltaV2Mps = circularSpeedTarget - transferApoapsisSpeed;
    double transferTimeSeconds = Math.PI * Math.sqrt(Math.pow(transferSemiMajorAxisMeters, 3.0) / MU);
    Instant burn1Time = mission.scenarioStart();
    Instant coastTime = burn1Time.plusSeconds(1);
    Instant burn2Time = burn1Time.plusSeconds(Math.max(1, Math.round(transferTimeSeconds)));
    List<String> warnings = new ArrayList<>();
    warnIfOutsideMission(mission, burn2Time, "Hohmann transfer burn 2", warnings);

    Map<String, Object> metadata = templateMetadata(templateInstanceId, request.type(), "SUMMARY");
    metadata.put("initialRadiusKm", initialRadiusMeters / 1000.0);
    metadata.put("targetAltitudeKm", request.targetAltitudeKm());
    metadata.put("targetRadiusKm", targetRadiusMeters / 1000.0);
    metadata.put("transferTimeSeconds", transferTimeSeconds);
    metadata.put("burn1DeltaVMps", Math.abs(deltaV1Mps));
    metadata.put("burn2DeltaVMps", Math.abs(deltaV2Mps));
    metadata.put("totalDeltaVMps", Math.abs(deltaV1Mps) + Math.abs(deltaV2Mps));

    Map<String, Object> burn1Metadata = withSchedule(
        templateMetadata(templateInstanceId, request.type(), "BURN_1"),
        mission,
        burn1Time);
    burn1Metadata.put("computedDeltaVMps", Math.abs(deltaV1Mps));

    Map<String, Object> coastMetadata = withSchedule(
        templateMetadata(templateInstanceId, request.type(), "TRANSFER_COAST"),
        mission,
        coastTime);
    coastMetadata.put("transferTimeSeconds", transferTimeSeconds);

    Map<String, Object> burn2Metadata = withSchedule(
        templateMetadata(templateInstanceId, request.type(), "BURN_2"),
        mission,
        burn2Time);
    burn2Metadata.put("computedDeltaVMps", Math.abs(deltaV2Mps));

    List<CreateTimelineEventRequest> events = List.of(
        new CreateTimelineEventRequest(
            sequenceIndex,
            TimelineEventType.IMPULSIVE_BURN,
            "Hohmann Burn 1",
            true,
            burn1Time,
            impulsiveParameters(burn1Metadata, signedTangentialDeltaV(deltaV1Mps))),
        new CreateTimelineEventRequest(
            sequenceIndex + 1,
            TimelineEventType.COAST,
            "Transfer Coast",
            true,
            coastTime,
            coastMetadata),
        new CreateTimelineEventRequest(
            sequenceIndex + 2,
            TimelineEventType.IMPULSIVE_BURN,
            "Hohmann Burn 2",
            true,
            burn2Time,
            impulsiveParameters(burn2Metadata, signedTangentialDeltaV(deltaV2Mps))));

    return new ManeuverTemplatePreview(request.type(), templateInstanceId, metadata, warnings, events);
  }

  private Orbit orbitAtMissionStart(Mission mission) {
    if (mission.subjectNoradId() == null && mission.subjectOrbitId() == null) {
      throw new IllegalArgumentException("Maneuver template preview requires a mission subject.");
    }
    PropagationContext context = mission.subjectOrbitId() == null
        ? contextFactory.buildLegacyFreeContext(mission.subjectNoradId())
        : contextFactory.buildManualOrbitContext(mission.subjectOrbitId());
    Instant date = mission.scenarioStart();
    if (context.initialOrbit() != null) {
      SpacecraftState state = new KeplerianPropagator(context.initialOrbit())
          .propagate(OrekitStateMapper.toAbsoluteDate(date));
      return state.getOrbit();
    }
    TLEPropagator propagator = TLEPropagator.selectExtrapolator(context.tle());
    PVCoordinates pv = propagator.getPVCoordinates(OrekitStateMapper.toAbsoluteDate(date), orekit.eme2000());
    return new CartesianOrbit(pv, orekit.eme2000(), OrekitStateMapper.toAbsoluteDate(date), MU);
  }

  private CircularizationPoint circularizationPoint(KeplerianOrbit orbit, double targetRadiusMeters) {
    List<String> warnings = new ArrayList<>();
    double eccentricity = orbit.getE();
    double currentRadiusMeters = orbit.getPosition().getNorm();
    if (eccentricity < SMALL_ECCENTRICITY) {
      if (Math.abs(currentRadiusMeters - targetRadiusMeters) / 1000.0 > INTERSECTION_TOLERANCE_KM) {
        warnings.add("Current orbit is near-circular and does not naturally coast to the requested target altitude; circularization is computed at the current radius.");
      }
      return new CircularizationPoint(currentRadiusMeters, 0.0, warnings);
    }

    double semiMajorAxis = orbit.getA();
    double perigeeRadius = semiMajorAxis * (1.0 - eccentricity);
    double apogeeRadius = semiMajorAxis * (1.0 + eccentricity);
    if (targetRadiusMeters < perigeeRadius - INTERSECTION_TOLERANCE_KM * 1000.0
        || targetRadiusMeters > apogeeRadius + INTERSECTION_TOLERANCE_KM * 1000.0) {
      warnings.add("Requested target altitude is outside the current orbit radius range; circularization is computed at the current radius.");
      return new CircularizationPoint(currentRadiusMeters, 0.0, warnings);
    }

    double p = semiMajorAxis * (1.0 - eccentricity * eccentricity);
    double cosTrueAnomaly = ((p / targetRadiusMeters) - 1.0) / eccentricity;
    cosTrueAnomaly = Math.max(-1.0, Math.min(1.0, cosTrueAnomaly));
    double anomaly = Math.acos(cosTrueAnomaly);
    double currentMean = normalizeAngle(orbit.getMeanAnomaly());
    double candidateA = meanAnomalyFromTrue(anomaly, eccentricity);
    double candidateB = meanAnomalyFromTrue(-anomaly, eccentricity);
    double deltaA = positiveAngleDelta(currentMean, candidateA);
    double deltaB = positiveAngleDelta(currentMean, candidateB);
    double selectedDeltaMean = Math.min(deltaA, deltaB);
    double meanMotion = Math.sqrt(MU / Math.pow(semiMajorAxis, 3.0));
    return new CircularizationPoint(targetRadiusMeters, selectedDeltaMean / meanMotion, warnings);
  }

  private Map<String, Object> templateMetadata(
      String templateInstanceId,
      ManeuverTemplateType templateType,
      String templateRole) {
    Map<String, Object> metadata = new LinkedHashMap<>();
    metadata.put("templateInstanceId", templateInstanceId);
    metadata.put("templateType", templateType.name());
    metadata.put("templateRole", templateRole);
    metadata.put("generated", true);
    return metadata;
  }

  private Map<String, Object> withSchedule(Map<String, Object> parameters, Mission mission, Instant executionTime) {
    long offsetSeconds = Math.round((executionTime.toEpochMilli() - mission.scenarioStart().toEpochMilli()) / 1000.0);
    parameters.put("scheduleMode", "MET");
    parameters.put("scheduleValue", metOffsetLabel(offsetSeconds));
    parameters.put("scheduleOffsetSeconds", offsetSeconds);
    return parameters;
  }

  private Map<String, Object> impulsiveParameters(Map<String, Object> metadata, double deltaVMps) {
    metadata.put("ispSeconds", 220.0);
    metadata.put("directionFrame", "TNW");
    metadata.put("deltaVxMps", deltaVMps);
    metadata.put("deltaVyMps", 0.0);
    metadata.put("deltaVzMps", 0.0);
    return metadata;
  }

  private double signedTangentialDeltaV(double deltaVMps) {
    return Math.abs(deltaVMps) < 1.0e-9 ? 0.0 : deltaVMps;
  }

  private double radiusMeters(Double altitudeKm) {
    if (altitudeKm == null || !Double.isFinite(altitudeKm) || altitudeKm < 0.0) {
      throw new IllegalArgumentException("Target altitude must be a finite value greater than or equal to zero.");
    }
    return (EARTH_RADIUS_KM + altitudeKm) * 1000.0;
  }

  private double speedAtRadius(double semiMajorAxisMeters, double radiusMeters) {
    return Math.sqrt(MU * ((2.0 / radiusMeters) - (1.0 / semiMajorAxisMeters)));
  }

  private double meanAnomalyFromTrue(double trueAnomaly, double eccentricity) {
    double eccentricAnomaly = 2.0 * Math.atan2(
        Math.sqrt(1.0 - eccentricity) * Math.sin(trueAnomaly / 2.0),
        Math.sqrt(1.0 + eccentricity) * Math.cos(trueAnomaly / 2.0));
    return normalizeAngle(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly));
  }

  private double positiveAngleDelta(double from, double to) {
    return normalizeAngle(to - from);
  }

  private double normalizeAngle(double angle) {
    double normalized = angle % (2.0 * Math.PI);
    return normalized < 0.0 ? normalized + 2.0 * Math.PI : normalized;
  }

  private void validateRequest(ManeuverTemplateRequest request) {
    if (request.type() == null) {
      throw new IllegalArgumentException("Maneuver template type is required.");
    }
    radiusMeters(request.targetAltitudeKm());
  }

  private void warnIfOutsideMission(Mission mission, Instant executionTime, String label, List<String> warnings) {
    if (executionTime.isBefore(mission.scenarioStart()) || executionTime.isAfter(mission.scenarioEnd())) {
      warnings.add(label + " falls outside the mission window and cannot be applied until the mission end time is extended.");
    }
  }

  private String metOffsetLabel(long totalSeconds) {
    long absolute = Math.abs(totalSeconds);
    long hours = absolute / 3600;
    long minutes = (absolute % 3600) / 60;
    long seconds = absolute % 60;
    return String.format("%s%02d:%02d:%02d", totalSeconds < 0 ? "T-" : "T+", hours, minutes, seconds);
  }

  private record CircularizationPoint(double radiusMeters, double coastSeconds, List<String> warnings) {
  }
}
