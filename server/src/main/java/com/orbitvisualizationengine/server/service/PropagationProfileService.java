package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.NumericalIntegratorType;
import com.orbitvisualizationengine.server.domain.PropagationProfile;
import com.orbitvisualizationengine.server.domain.PropagationProfileOwnerType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.dto.UpdatePropagationProfileRequest;
import com.orbitvisualizationengine.server.repository.AnalysisConfigRepository;
import com.orbitvisualizationengine.server.repository.ManualOrbitRepository;
import com.orbitvisualizationengine.server.repository.PropagationProfileRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class PropagationProfileService {
  private final PropagationProfileRepository profiles;
  private final AnalysisConfigRepository analysisConfigs;
  private final ManualOrbitRepository manualOrbits;

  public PropagationProfileService(
      PropagationProfileRepository profiles,
      AnalysisConfigRepository analysisConfigs,
      ManualOrbitRepository manualOrbits) {
    this.profiles = profiles;
    this.analysisConfigs = analysisConfigs;
    this.manualOrbits = manualOrbits;
  }

  public PropagationProfile getOrCreateSatelliteProfile(int noradId) {
    return profiles.findByOwner(PropagationProfileOwnerType.SATELLITE, String.valueOf(noradId))
        .orElseGet(() -> profiles.save(fromSatelliteConfig(
            analysisConfigs.findByNoradId(noradId).orElseGet(() -> AnalysisConfigRepository.defaultConfig(noradId)))));
  }

  public PropagationProfile syncSatelliteProfile(SatelliteAnalysisConfig config) {
    PropagationProfile existing = profiles
        .findByOwner(PropagationProfileOwnerType.SATELLITE, String.valueOf(config.noradId()))
        .orElse(null);
    PropagationProfile next = fromSatelliteConfig(config, existing == null ? null : existing.id(), existing == null ? null : existing.createdAt());
    return profiles.save(next);
  }

  public PropagationProfile ensureManualOrbitProfile(ManualOrbitRecord orbit) {
    return profiles.findByOwner(PropagationProfileOwnerType.MANUAL_ORBIT, orbit.id())
        .orElseGet(() -> profiles.save(defaultManualOrbitProfile(orbit)));
  }

  public PropagationProfile createMissionSnapshot(Mission mission) {
    PropagationProfile source = mission.subjectOrbitId() == null
        ? getOrCreateSatelliteProfile(mission.subjectNoradId())
        : getOrCreateManualOrbitProfile(mission.subjectOrbitId());
    Instant now = Instant.now();
    return profiles.save(new PropagationProfile(
        "profile-mission-" + UUID.randomUUID(),
        PropagationProfileOwnerType.MISSION,
        mission.id(),
        mission.name() + " Propagation Profile",
        source.preset(),
        mission.propagatorType(),
        source.gravityEnabled(),
        source.gravityDegree(),
        source.gravityOrder(),
        source.dragEnabled(),
        source.solarRadiationPressureEnabled(),
        source.thirdBodySunEnabled(),
        source.thirdBodyMoonEnabled(),
        source.maneuverModelEnabled(),
        source.integratorType(),
        source.dryMassKg(),
        source.fuelMassKg(),
        source.dragAreaM2(),
        source.dragCoefficient(),
        source.srpAreaM2(),
        source.reflectivityCoefficient(),
        source.nominalThrustN(),
        source.nominalIspS(),
        source.integratorMinStep(),
        source.integratorMaxStep(),
        source.integratorAbsTol(),
        source.integratorRelTol(),
        "Mission snapshot copied from " + source.ownerType() + " profile " + source.ownerId(),
        now,
        now));
  }

  private PropagationProfile getOrCreateManualOrbitProfile(String orbitId) {
    return profiles.findByOwner(PropagationProfileOwnerType.MANUAL_ORBIT, orbitId)
        .orElseGet(() -> {
          ManualOrbitRecord orbit = manualOrbits.findById(orbitId)
              .orElseThrow(() -> new IllegalArgumentException("Manual orbit " + orbitId + " was not found."));
          return ensureManualOrbitProfile(orbit);
        });
  }

  public PropagationProfile missionProfile(String missionId) {
    return profiles.findByOwner(PropagationProfileOwnerType.MISSION, missionId)
        .orElseThrow(() -> new IllegalArgumentException("Mission propagation profile not found: " + missionId));
  }

  public PropagationProfile getOrCreateMissionProfile(Mission mission) {
    return profiles.findByOwner(PropagationProfileOwnerType.MISSION, mission.id())
        .orElseGet(() -> createMissionSnapshot(mission));
  }

  public PropagationProfile updateMissionProfile(String missionId, UpdatePropagationProfileRequest request) {
    PropagationProfile current = missionProfile(missionId);
    PropagationProfile next = apply(current, request);
    validate(next);
    return profiles.save(next);
  }

  public SatelliteAnalysisConfig missionAnalysisConfig(Mission mission) {
    PropagationProfile profile = getOrCreateMissionProfile(mission);
    return profile.toAnalysisConfig(mission.subjectNoradId() == null ? 0 : mission.subjectNoradId());
  }

  private PropagationProfile fromSatelliteConfig(SatelliteAnalysisConfig config) {
    return fromSatelliteConfig(config, null, null);
  }

  private PropagationProfile fromSatelliteConfig(SatelliteAnalysisConfig config, String existingId, Instant existingCreatedAt) {
    Instant now = Instant.now();
    return new PropagationProfile(
        existingId == null ? "profile-satellite-" + config.noradId() : existingId,
        PropagationProfileOwnerType.SATELLITE,
        String.valueOf(config.noradId()),
        "NORAD " + config.noradId() + " Propagation Profile",
        config.preset(),
        config.propagatorType(),
        config.gravityEnabled(),
        config.gravityDegree(),
        config.gravityOrder(),
        config.dragEnabled(),
        config.solarRadiationPressureEnabled(),
        config.thirdBodySunEnabled(),
        config.thirdBodyMoonEnabled(),
        config.maneuverModelEnabled(),
        NumericalIntegratorType.DORMAND_PRINCE_853,
        config.dryMassKg(),
        config.fuelMassKg(),
        config.dragAreaM2(),
        config.dragCoefficient(),
        config.srpAreaM2(),
        config.reflectivityCoefficient(),
        config.nominalThrustN(),
        config.nominalIspS(),
        0.1,
        120.0,
        1.0,
        1.0,
        config.notes(),
        existingCreatedAt == null ? now : existingCreatedAt,
        now);
  }

  private PropagationProfile defaultManualOrbitProfile(ManualOrbitRecord orbit) {
    Instant now = Instant.now();
    return new PropagationProfile(
        "profile-orbit-" + UUID.randomUUID(),
        PropagationProfileOwnerType.MANUAL_ORBIT,
        orbit.id(),
        orbit.name() + " Propagation Profile",
        AnalysisPreset.MANEUVER_PLANNING,
        PropagatorType.NUMERICAL,
        false,
        2,
        0,
        false,
        false,
        false,
        false,
        true,
        NumericalIntegratorType.DORMAND_PRINCE_853,
        850.0,
        150.0,
        20.0,
        2.2,
        15.0,
        1.2,
        0.2,
        220.0,
        0.1,
        120.0,
        1.0,
        1.0,
        "Default manual/imported orbit mission-planning profile.",
        now,
        now);
  }

  private PropagationProfile apply(PropagationProfile current, UpdatePropagationProfileRequest request) {
    return new PropagationProfile(
        current.id(),
        current.ownerType(),
        current.ownerId(),
        request.name() == null || request.name().isBlank() ? current.name() : request.name().trim(),
        request.preset() == null ? current.preset() : request.preset(),
        request.propagatorType() == null ? current.propagatorType() : request.propagatorType(),
        request.gravityEnabled() == null ? current.gravityEnabled() : request.gravityEnabled(),
        request.gravityDegree() == null ? current.gravityDegree() : request.gravityDegree(),
        request.gravityOrder() == null ? current.gravityOrder() : request.gravityOrder(),
        request.dragEnabled() == null ? current.dragEnabled() : request.dragEnabled(),
        request.solarRadiationPressureEnabled() == null ? current.solarRadiationPressureEnabled() : request.solarRadiationPressureEnabled(),
        request.thirdBodySunEnabled() == null ? current.thirdBodySunEnabled() : request.thirdBodySunEnabled(),
        request.thirdBodyMoonEnabled() == null ? current.thirdBodyMoonEnabled() : request.thirdBodyMoonEnabled(),
        request.maneuverModelEnabled() == null ? current.maneuverModelEnabled() : request.maneuverModelEnabled(),
        request.integratorType() == null ? current.integratorType() : request.integratorType(),
        request.dryMassKg() == null ? current.dryMassKg() : request.dryMassKg(),
        request.fuelMassKg() == null ? current.fuelMassKg() : request.fuelMassKg(),
        request.dragAreaM2() == null ? current.dragAreaM2() : request.dragAreaM2(),
        request.dragCoefficient() == null ? current.dragCoefficient() : request.dragCoefficient(),
        request.srpAreaM2() == null ? current.srpAreaM2() : request.srpAreaM2(),
        request.reflectivityCoefficient() == null ? current.reflectivityCoefficient() : request.reflectivityCoefficient(),
        request.nominalThrustN() == null ? current.nominalThrustN() : request.nominalThrustN(),
        request.nominalIspS() == null ? current.nominalIspS() : request.nominalIspS(),
        request.integratorMinStep() == null ? current.integratorMinStep() : request.integratorMinStep(),
        request.integratorMaxStep() == null ? current.integratorMaxStep() : request.integratorMaxStep(),
        request.integratorAbsTol() == null ? current.integratorAbsTol() : request.integratorAbsTol(),
        request.integratorRelTol() == null ? current.integratorRelTol() : request.integratorRelTol(),
        request.notes() == null ? current.notes() : request.notes(),
        current.createdAt(),
        Instant.now());
  }

  private void validate(PropagationProfile profile) {
    if (profile.gravityDegree() < 2) {
      throw new IllegalArgumentException("Gravity degree must be at least 2.");
    }
    if (profile.gravityOrder() < 0 || profile.gravityOrder() > profile.gravityDegree()) {
      throw new IllegalArgumentException("Gravity order must be between 0 and gravity degree.");
    }
    if (profile.dryMassKg() < 0 || profile.fuelMassKg() < 0) {
      throw new IllegalArgumentException("Spacecraft mass values must be non-negative.");
    }
    if (profile.dragAreaM2() < 0 || profile.srpAreaM2() < 0) {
      throw new IllegalArgumentException("Spacecraft area values must be non-negative.");
    }
    if (profile.nominalThrustN() < 0 || profile.nominalIspS() < 0) {
      throw new IllegalArgumentException("Nominal maneuver values must be non-negative.");
    }
    if (profile.integratorMinStep() <= 0 || profile.integratorMaxStep() < profile.integratorMinStep()
        || profile.integratorAbsTol() <= 0 || profile.integratorRelTol() <= 0) {
      throw new IllegalArgumentException("Integrator settings must be positive and max step must be >= min step.");
    }
  }
}
