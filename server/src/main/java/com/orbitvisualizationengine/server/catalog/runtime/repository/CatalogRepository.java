package com.orbitvisualizationengine.server.catalog.runtime.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogRepository {
  private static final String LATEST_PUBLISHED_SELECT = """
      select
        sc.norad_cat_id,
        sc.current_version_id as catalog_version_id,
        sc.current_history_id as history_id,
        src.code as source_code,
        src.display_name as source_display_name,
        h.object_name,
        h.object_id,
        h.object_type,
        h.classification,
        h.country_code,
        h.launch_year,
        h.launch_number,
        h.launch_piece,
        h.epoch_at,
        h.tle_line1,
        h.tle_line2,
        h.tle_sha256,
        h.element_set_no,
        h.ephemeris_type,
        h.inclination_deg,
        h.raan_deg,
        h.eccentricity,
        h.argument_of_perigee_deg,
        h.mean_anomaly_deg,
        h.mean_motion_rev_per_day,
        h.mean_motion_dot,
        h.mean_motion_ddot,
        h.bstar,
        h.revolution_number,
        sc.first_seen_version_id,
        sc.last_seen_version_id,
        sc.first_seen_at,
        sc.last_seen_at
      from satellite_catalog sc
      join satellite_catalog_history h on h.id = sc.current_history_id
      join catalog_versions cv on cv.id = sc.current_version_id
      join catalog_sources src on src.id = cv.source_id
      where cv.status = 'AVAILABLE'
        and h.record_type = 'TLE'
      """;

  private final JdbcTemplate jdbc;
  private final RowMapper<CatalogSatelliteRecord> rowMapper = new CatalogSatelliteRecordRowMapper();

  public CatalogRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<CatalogSatelliteRecord> findByNoradId(int noradCatalogId) {
    List<CatalogSatelliteRecord> records = jdbc.query(
        LATEST_PUBLISHED_SELECT + " and sc.norad_cat_id = ?",
        rowMapper,
        noradCatalogId);
    return records.stream().findFirst();
  }

  public List<CatalogSatelliteRecord> findAll() {
    return jdbc.query(
        LATEST_PUBLISHED_SELECT + " order by sc.norad_cat_id",
        rowMapper);
  }

  public List<CatalogSatelliteRecord> findByName(String nameQuery) {
    return jdbc.query(
        LATEST_PUBLISHED_SELECT + " and lower(h.object_name) like ? escape '\\' order by h.object_name, sc.norad_cat_id",
        rowMapper,
        "%" + escapeLike(nameQuery.toLowerCase()) + "%");
  }

  public boolean exists(int noradCatalogId) {
    Boolean exists = jdbc.queryForObject("""
        select exists(
          select 1
          from satellite_catalog
          where norad_cat_id = ?
        )
        """, Boolean.class, noradCatalogId);
    return Boolean.TRUE.equals(exists);
  }

  public long count() {
    Long count = jdbc.queryForObject("""
        select count(*)
        from satellite_catalog
        """, Long.class);
    return count == null ? 0 : count;
  }

  public Stream<CatalogSatelliteRecord> stream() {
    return jdbc.queryForStream(
        LATEST_PUBLISHED_SELECT + " order by sc.norad_cat_id",
        rowMapper);
  }

  private String escapeLike(String value) {
    return value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_");
  }

  private static final class CatalogSatelliteRecordRowMapper implements RowMapper<CatalogSatelliteRecord> {
    @Override
    public CatalogSatelliteRecord mapRow(ResultSet rs, int rowNum) throws SQLException {
      return new CatalogSatelliteRecord(
          rs.getInt("norad_cat_id"),
          rs.getLong("catalog_version_id"),
          rs.getLong("history_id"),
          rs.getString("source_code"),
          rs.getString("source_display_name"),
          rs.getString("object_name"),
          rs.getString("object_id"),
          rs.getString("object_type"),
          rs.getString("classification"),
          rs.getString("country_code"),
          integerOrNull(rs, "launch_year"),
          integerOrNull(rs, "launch_number"),
          rs.getString("launch_piece"),
          instantOrNull(rs, "epoch_at"),
          rs.getString("tle_line1"),
          rs.getString("tle_line2"),
          rs.getString("tle_sha256"),
          integerOrNull(rs, "element_set_no"),
          integerOrNull(rs, "ephemeris_type"),
          rs.getBigDecimal("inclination_deg"),
          rs.getBigDecimal("raan_deg"),
          rs.getBigDecimal("eccentricity"),
          rs.getBigDecimal("argument_of_perigee_deg"),
          rs.getBigDecimal("mean_anomaly_deg"),
          rs.getBigDecimal("mean_motion_rev_per_day"),
          rs.getBigDecimal("mean_motion_dot"),
          rs.getBigDecimal("mean_motion_ddot"),
          rs.getBigDecimal("bstar"),
          integerOrNull(rs, "revolution_number"),
          rs.getLong("first_seen_version_id"),
          rs.getLong("last_seen_version_id"),
          instantOrNull(rs, "first_seen_at"),
          instantOrNull(rs, "last_seen_at"));
    }

    private static Integer integerOrNull(ResultSet rs, String columnName) throws SQLException {
      int value = rs.getInt(columnName);
      return rs.wasNull() ? null : value;
    }

    private static java.time.Instant instantOrNull(ResultSet rs, String columnName) throws SQLException {
      Timestamp timestamp = rs.getTimestamp(columnName);
      return timestamp == null ? null : timestamp.toInstant();
    }
  }
}
