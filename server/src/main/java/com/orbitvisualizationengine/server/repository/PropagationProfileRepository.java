package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.AnalysisPreset;
import com.orbitvisualizationengine.server.domain.NumericalIntegratorType;
import com.orbitvisualizationengine.server.domain.PropagationProfile;
import com.orbitvisualizationengine.server.domain.PropagationProfileOwnerType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PropagationProfileRepository {
  private final JdbcTemplate jdbc;

  public PropagationProfileRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public PropagationProfile save(PropagationProfile profile) {
    jdbc.update("""
        insert into propagation_profiles(
          id, owner_type, owner_id, name, preset, propagator_type, gravity_enabled, gravity_degree, gravity_order,
          drag_enabled, solar_radiation_pressure_enabled, third_body_sun_enabled, third_body_moon_enabled,
          maneuver_model_enabled, integrator_type, dry_mass_kg, fuel_mass_kg, drag_area_m2, drag_coefficient, srp_area_m2,
          reflectivity_coefficient, nominal_thrust_n, nominal_isp_s, integrator_min_step, integrator_max_step,
          integrator_abs_tol, integrator_rel_tol, notes, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do update set
          owner_type = excluded.owner_type,
          owner_id = excluded.owner_id,
          name = excluded.name,
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
          integrator_type = excluded.integrator_type,
          dry_mass_kg = excluded.dry_mass_kg,
          fuel_mass_kg = excluded.fuel_mass_kg,
          drag_area_m2 = excluded.drag_area_m2,
          drag_coefficient = excluded.drag_coefficient,
          srp_area_m2 = excluded.srp_area_m2,
          reflectivity_coefficient = excluded.reflectivity_coefficient,
          nominal_thrust_n = excluded.nominal_thrust_n,
          nominal_isp_s = excluded.nominal_isp_s,
          integrator_min_step = excluded.integrator_min_step,
          integrator_max_step = excluded.integrator_max_step,
          integrator_abs_tol = excluded.integrator_abs_tol,
          integrator_rel_tol = excluded.integrator_rel_tol,
          notes = excluded.notes,
          updated_at = excluded.updated_at
        """,
        profile.id(),
        profile.ownerType().name(),
        profile.ownerId(),
        profile.name(),
        profile.preset().name(),
        profile.propagatorType().name(),
        profile.gravityEnabled(),
        profile.gravityDegree(),
        profile.gravityOrder(),
        profile.dragEnabled(),
        profile.solarRadiationPressureEnabled(),
        profile.thirdBodySunEnabled(),
        profile.thirdBodyMoonEnabled(),
        profile.maneuverModelEnabled(),
        profile.integratorType().name(),
        profile.dryMassKg(),
        profile.fuelMassKg(),
        profile.dragAreaM2(),
        profile.dragCoefficient(),
        profile.srpAreaM2(),
        profile.reflectivityCoefficient(),
        profile.nominalThrustN(),
        profile.nominalIspS(),
        profile.integratorMinStep(),
        profile.integratorMaxStep(),
        profile.integratorAbsTol(),
        profile.integratorRelTol(),
        profile.notes(),
        Timestamp.from(profile.createdAt()),
        Timestamp.from(profile.updatedAt()));
    return profile;
  }

  public Optional<PropagationProfile> findByOwner(PropagationProfileOwnerType ownerType, String ownerId) {
    List<PropagationProfile> rows = jdbc.query("""
        select *
        from propagation_profiles
        where owner_type = ? and owner_id = ?
        """, this::map, ownerType.name(), ownerId);
    return rows.stream().findFirst();
  }

  public Optional<PropagationProfile> findById(String id) {
    return jdbc.query("select * from propagation_profiles where id = ?", this::map, id).stream().findFirst();
  }

  private PropagationProfile map(ResultSet rs, int rowNum) throws SQLException {
    return new PropagationProfile(
        rs.getString("id"),
        PropagationProfileOwnerType.valueOf(rs.getString("owner_type")),
        rs.getString("owner_id"),
        rs.getString("name"),
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
        NumericalIntegratorType.valueOf(rs.getString("integrator_type")),
        rs.getDouble("dry_mass_kg"),
        rs.getDouble("fuel_mass_kg"),
        rs.getDouble("drag_area_m2"),
        rs.getDouble("drag_coefficient"),
        rs.getDouble("srp_area_m2"),
        rs.getDouble("reflectivity_coefficient"),
        rs.getDouble("nominal_thrust_n"),
        rs.getDouble("nominal_isp_s"),
        rs.getDouble("integrator_min_step"),
        rs.getDouble("integrator_max_step"),
        rs.getDouble("integrator_abs_tol"),
        rs.getDouble("integrator_rel_tol"),
        rs.getString("notes"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }
}
