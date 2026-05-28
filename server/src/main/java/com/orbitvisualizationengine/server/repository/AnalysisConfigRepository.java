package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AnalysisConfigRepository {
  private final JdbcTemplate jdbc;

  public AnalysisConfigRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<SatelliteAnalysisConfig> findByNoradId(int noradId) {
    List<SatelliteAnalysisConfig> rows = jdbc.query("""
        select *
        from satellite_analysis_configs
        where norad_id = ?
        """, this::map, noradId);
    return rows.stream().findFirst();
  }

  public SatelliteAnalysisConfig save(SatelliteAnalysisConfig config) {
    jdbc.update("""
        insert into satellite_analysis_configs(
          norad_id, preset, propagator_type, gravity_enabled, gravity_degree, gravity_order,
          drag_enabled, solar_radiation_pressure_enabled, third_body_sun_enabled,
          third_body_moon_enabled, maneuver_model_enabled, dry_mass_kg, fuel_mass_kg,
          drag_area_m2, drag_coefficient, srp_area_m2, reflectivity_coefficient,
          nominal_thrust_n, nominal_isp_s, notes, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (norad_id) do update set
          preset = excluded.preset,
          propagator_type = excluded.propagator_type,
          gravity_enabled = excluded.gravity_enabled,
          gravity_degree = excluded.gravity_degree,
          gravity_order = excluded.gravity_order,
          drag_enabled = excluded.drag_enabled,
          solar_radiation_pressure_enabled = excluded.solar_radiation_pressure_enabled,
          third_body_sun_enabled = excluded.third_body_sun_enabled,
          third_body_moon_enabled = excluded.third_body_moon_enabled,
          maneuver_model_enabled = excluded.maneuver_model_enabled,
          dry_mass_kg = excluded.dry_mass_kg,
          fuel_mass_kg = excluded.fuel_mass_kg,
          drag_area_m2 = excluded.drag_area_m2,
          drag_coefficient = excluded.drag_coefficient,
          srp_area_m2 = excluded.srp_area_m2,
          reflectivity_coefficient = excluded.reflectivity_coefficient,
          nominal_thrust_n = excluded.nominal_thrust_n,
          nominal_isp_s = excluded.nominal_isp_s,
          notes = excluded.notes,
          updated_at = excluded.updated_at
        """,
        config.noradId(),
        config.preset().name(),
        config.propagatorType().name(),
        config.gravityEnabled(),
        config.gravityDegree(),
        config.gravityOrder(),
        config.dragEnabled(),
        config.solarRadiationPressureEnabled(),
        config.thirdBodySunEnabled(),
        config.thirdBodyMoonEnabled(),
        config.maneuverModelEnabled(),
        config.dryMassKg(),
        config.fuelMassKg(),
        config.dragAreaM2(),
        config.dragCoefficient(),
        config.srpAreaM2(),
        config.reflectivityCoefficient(),
        config.nominalThrustN(),
        config.nominalIspS(),
        config.notes(),
        Timestamp.from(config.updatedAt()));
    return config;
  }

  private SatelliteAnalysisConfig map(ResultSet rs, int rowNum) throws SQLException {
    return new SatelliteAnalysisConfig(
        rs.getInt("norad_id"),
        AnalysisPreset.valueOf(rs.getString("preset")),
        PropagatorType.valueOf(rs.getString("propagator_type")),
        rs.getBoolean("gravity_enabled"),
        rs.getInt("gravity_degree"),
        rs.getInt("gravity_order"),
        rs.getBoolean("drag_enabled"),
        rs.getBoolean("solar_radiation_pressure_enabled"),
        rs.getBoolean("third_body_sun_enabled"),
        rs.getBoolean("third_body_moon_enabled"),
        rs.getBoolean("maneuver_model_enabled"),
        rs.getDouble("dry_mass_kg"),
        rs.getDouble("fuel_mass_kg"),
        rs.getDouble("drag_area_m2"),
        rs.getDouble("drag_coefficient"),
        rs.getDouble("srp_area_m2"),
        rs.getDouble("reflectivity_coefficient"),
        rs.getDouble("nominal_thrust_n"),
        rs.getDouble("nominal_isp_s"),
        rs.getString("notes"),
        rs.getTimestamp("updated_at").toInstant());
  }

  public static SatelliteAnalysisConfig defaultConfig(int noradId) {
    return new SatelliteAnalysisConfig(
        noradId,
        AnalysisPreset.FAST_PREVIEW,
        PropagatorType.TLE_SGP4,
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
        "Default fast preview uses TLE/SGP4. Advanced force-model toggles are stored for numerical propagation.",
        Instant.now());
  }
}
