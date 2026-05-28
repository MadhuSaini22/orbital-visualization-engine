package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.config.AppProperties;
import com.orbitvisualizationengine.server.dto.AnalysisConfigResponse;
import com.orbitvisualizationengine.server.dto.AnalysisConfigUpdateRequest;
import com.orbitvisualizationengine.server.repository.AnalysisConfigRepository;
import com.orbitvisualizationengine.server.repository.SatelliteRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class AnalysisConfigService {
  private final AnalysisConfigRepository configs;
  private final SatelliteRepository satellites;
  private final AppProperties properties;

  public AnalysisConfigService(AnalysisConfigRepository configs, SatelliteRepository satellites, AppProperties properties) {
    this.configs = configs;
    this.satellites = satellites;
    this.properties = properties;
  }

  public AnalysisConfigResponse get(int noradId) {
    SatelliteAnalysisConfig config = getOrCreate(noradId);
    return response(config);
  }

  public AnalysisConfigResponse update(int noradId, AnalysisConfigUpdateRequest request) {
    SatelliteAnalysisConfig current = getOrCreate(noradId);
    SatelliteAnalysisConfig next = new SatelliteAnalysisConfig(
        noradId,
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
        current.dryMassKg(),
        current.fuelMassKg(),
        current.dragAreaM2(),
        current.dragCoefficient(),
        current.srpAreaM2(),
        current.reflectivityCoefficient(),
        current.nominalThrustN(),
        current.nominalIspS(),
        request.notes() == null ? current.notes() : request.notes(),
        Instant.now());
    return response(configs.save(next));
  }

  public AnalysisConfigResponse applyPreset(int noradId, AnalysisPreset preset) {
    SatelliteAnalysisConfig current = getOrCreate(noradId);
    SatelliteAnalysisConfig next = switch (preset) {
      case FAST_PREVIEW -> new SatelliteAnalysisConfig(
          noradId, preset, PropagatorType.TLE_SGP4, false, 2, 0,
          false, false, false, false, false,
          current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(), current.dragCoefficient(),
          current.srpAreaM2(), current.reflectivityCoefficient(), current.nominalThrustN(), current.nominalIspS(),
          "Fast preview: TLE/SGP4 only.", Instant.now());
      case OPERATIONAL_REVIEW -> new SatelliteAnalysisConfig(
          noradId, preset, PropagatorType.NUMERICAL, true, 20, 20,
          true, false, true, true, false,
          current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(), current.dragCoefficient(),
          current.srpAreaM2(), current.reflectivityCoefficient(), current.nominalThrustN(), current.nominalIspS(),
          "Operational review preset: stores gravity, drag, Sun/Moon settings for numerical propagation.", Instant.now());
      case HIGH_FIDELITY -> new SatelliteAnalysisConfig(
          noradId, preset, PropagatorType.NUMERICAL, true, 40, 40,
          true, true, true, true, false,
          current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(), current.dragCoefficient(),
          current.srpAreaM2(), current.reflectivityCoefficient(), current.nominalThrustN(), current.nominalIspS(),
          "High fidelity preset: stores gravity, drag, SRP, Sun/Moon settings for numerical propagation.", Instant.now());
      case MANEUVER_PLANNING -> new SatelliteAnalysisConfig(
          noradId, preset, PropagatorType.NUMERICAL, true, 20, 20,
          true, true, true, true, true,
          current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(), current.dragCoefficient(),
          current.srpAreaM2(), current.reflectivityCoefficient(), current.nominalThrustN(), current.nominalIspS(),
          "Maneuver planning preset: enables maneuver-model flag plus operational force-model settings.", Instant.now());
    };

    if (current.notes() != null && current.notes().startsWith("Operator note:")) {
      next = new SatelliteAnalysisConfig(
          next.noradId(), next.preset(), next.propagatorType(), next.gravityEnabled(), next.gravityDegree(),
          next.gravityOrder(), next.dragEnabled(), next.solarRadiationPressureEnabled(), next.thirdBodySunEnabled(),
          next.thirdBodyMoonEnabled(), next.maneuverModelEnabled(), next.dryMassKg(), next.fuelMassKg(),
          next.dragAreaM2(), next.dragCoefficient(), next.srpAreaM2(), next.reflectivityCoefficient(),
          next.nominalThrustN(), next.nominalIspS(), current.notes(), next.updatedAt());
    }

    return response(configs.save(next));
  }

  public AnalysisConfigResponse setMode(int noradId, String mode, boolean enabled) {
    SatelliteAnalysisConfig current = getOrCreate(noradId);
    String normalizedMode = mode.trim().toLowerCase(Locale.ROOT).replace("-", "_");
    SatelliteAnalysisConfig next = switch (normalizedMode) {
      case "gravity" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          enabled, current.gravityDegree(), current.gravityOrder(), current.dragEnabled(),
          current.solarRadiationPressureEnabled(), current.thirdBodySunEnabled(), current.thirdBodyMoonEnabled(),
          current.maneuverModelEnabled(), current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(),
          current.dragCoefficient(), current.srpAreaM2(), current.reflectivityCoefficient(),
          current.nominalThrustN(), current.nominalIspS(), current.notes(), Instant.now());
      case "drag" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          current.gravityEnabled(), current.gravityDegree(), current.gravityOrder(), enabled,
          current.solarRadiationPressureEnabled(), current.thirdBodySunEnabled(), current.thirdBodyMoonEnabled(),
          current.maneuverModelEnabled(), current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(),
          current.dragCoefficient(), current.srpAreaM2(), current.reflectivityCoefficient(),
          current.nominalThrustN(), current.nominalIspS(), current.notes(), Instant.now());
      case "srp", "solar_radiation_pressure" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          current.gravityEnabled(), current.gravityDegree(), current.gravityOrder(), current.dragEnabled(),
          enabled, current.thirdBodySunEnabled(), current.thirdBodyMoonEnabled(),
          current.maneuverModelEnabled(), current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(),
          current.dragCoefficient(), current.srpAreaM2(), current.reflectivityCoefficient(),
          current.nominalThrustN(), current.nominalIspS(), current.notes(), Instant.now());
      case "sun", "third_body_sun" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          current.gravityEnabled(), current.gravityDegree(), current.gravityOrder(), current.dragEnabled(),
          current.solarRadiationPressureEnabled(), enabled, current.thirdBodyMoonEnabled(),
          current.maneuverModelEnabled(), current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(),
          current.dragCoefficient(), current.srpAreaM2(), current.reflectivityCoefficient(),
          current.nominalThrustN(), current.nominalIspS(), current.notes(), Instant.now());
      case "moon", "third_body_moon" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          current.gravityEnabled(), current.gravityDegree(), current.gravityOrder(), current.dragEnabled(),
          current.solarRadiationPressureEnabled(), current.thirdBodySunEnabled(), enabled,
          current.maneuverModelEnabled(), current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(),
          current.dragCoefficient(), current.srpAreaM2(), current.reflectivityCoefficient(),
          current.nominalThrustN(), current.nominalIspS(), current.notes(), Instant.now());
      case "maneuver", "maneuver_model" -> new SatelliteAnalysisConfig(
          noradId, current.preset(), enabled ? PropagatorType.NUMERICAL : current.propagatorType(),
          current.gravityEnabled(), current.gravityDegree(), current.gravityOrder(), current.dragEnabled(),
          current.solarRadiationPressureEnabled(), current.thirdBodySunEnabled(), current.thirdBodyMoonEnabled(),
          enabled, current.dryMassKg(), current.fuelMassKg(), current.dragAreaM2(), current.dragCoefficient(),
          current.srpAreaM2(), current.reflectivityCoefficient(), current.nominalThrustN(),
          current.nominalIspS(), current.notes(), Instant.now());
      default -> throw new IllegalArgumentException("Unsupported analysis mode: " + mode);
    };
    return response(configs.save(next));
  }

  public SatelliteAnalysisConfig getOrCreate(int noradId) {
    satellites.findByNoradId(noradId)
        .orElseThrow(() -> new IllegalArgumentException("Satellite " + noradId + " is not in the local catalog yet"));
    return configs.findByNoradId(noradId)
        .orElseGet(() -> configs.save(AnalysisConfigRepository.defaultConfig(noradId)));
  }

  public AnalysisConfigResponse response(SatelliteAnalysisConfig config) {
    return new AnalysisConfigResponse(config, activeModes(config), warnings(config));
  }

  private List<String> activeModes(SatelliteAnalysisConfig config) {
    List<String> modes = new ArrayList<>();
    if (config.gravityEnabled()) {
      modes.add("gravity");
    }
    if (config.dragEnabled()) {
      modes.add("drag");
    }
    if (config.solarRadiationPressureEnabled()) {
      modes.add("solar-radiation-pressure");
    }
    if (config.thirdBodySunEnabled()) {
      modes.add("third-body-sun");
    }
    if (config.thirdBodyMoonEnabled()) {
      modes.add("third-body-moon");
    }
    if (config.maneuverModelEnabled()) {
      modes.add("maneuver-model");
    }
    return modes;
  }

  private List<String> warnings(SatelliteAnalysisConfig config) {
    List<String> warnings = new ArrayList<>();
    if (config.propagatorType() == PropagatorType.TLE_SGP4
        && (config.dragEnabled() || config.solarRadiationPressureEnabled()
            || config.thirdBodySunEnabled() || config.thirdBodyMoonEnabled()
            || config.maneuverModelEnabled() || config.gravityEnabled())) {
      warnings.add("Force-model toggles only affect trajectory math when the propagator type is NUMERICAL.");
    }
    if (config.propagatorType() == PropagatorType.NUMERICAL && properties.orekitDataPath().isBlank()) {
      warnings.add("OREKIT_DATA_PATH is not configured. Enabled numerical force models that require Orekit external data will fail loudly instead of silently degrading; configure orekit-data for high-order gravity, EOP, ephemerides, space weather, and full fidelity.");
    }
    return warnings;
  }
}
