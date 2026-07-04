package com.orbitvisualizationengine.server.catalog.ingestion.repository;

import com.orbitvisualizationengine.server.catalog.ingestion.NormalizedCatalogRecord;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class SatelliteCatalogHistoryRepository {
  private final JdbcTemplate jdbc;

  public SatelliteCatalogHistoryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public long insertTleHistory(long versionId, long syncRunId, NormalizedCatalogRecord record) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          insert into satellite_catalog_history(
            catalog_version_id,
            sync_run_id,
            norad_cat_id,
            record_type,
            object_name,
            object_id,
            object_type,
            classification,
            country_code,
            launch_year,
            launch_number,
            launch_piece,
            epoch_at,
            tle_line1,
            tle_line2,
            tle_sha256,
            element_set_no,
            ephemeris_type,
            inclination_deg,
            raan_deg,
            eccentricity,
            argument_of_perigee_deg,
            mean_anomaly_deg,
            mean_motion_rev_per_day,
            mean_motion_dot,
            mean_motion_ddot,
            bstar,
            revolution_number,
            source_payload)
          values (?, ?, ?, 'TLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, versionId);
      statement.setLong(2, syncRunId);
      statement.setInt(3, record.noradCatalogId());
      statement.setString(4, record.objectName());
      statement.setString(5, record.objectId());
      statement.setString(6, record.objectType());
      statement.setString(7, record.classification());
      statement.setString(8, record.countryCode());
      setInteger(statement, 9, record.launchYear());
      setInteger(statement, 10, record.launchNumber());
      statement.setString(11, record.launchPiece());
      setInstant(statement, 12, record.epochAt());
      statement.setString(13, record.tleLine1());
      statement.setString(14, record.tleLine2());
      statement.setString(15, record.tleSha256());
      setInteger(statement, 16, record.elementSetNo());
      setInteger(statement, 17, record.ephemerisType());
      statement.setBigDecimal(18, record.inclinationDeg());
      statement.setBigDecimal(19, record.raanDeg());
      statement.setBigDecimal(20, record.eccentricity());
      statement.setBigDecimal(21, record.argumentOfPerigeeDeg());
      statement.setBigDecimal(22, record.meanAnomalyDeg());
      statement.setBigDecimal(23, record.meanMotionRevPerDay());
      statement.setBigDecimal(24, record.meanMotionDot());
      statement.setBigDecimal(25, record.meanMotionDdot());
      statement.setBigDecimal(26, record.bstar());
      setInteger(statement, 27, record.revolutionNumber());
      statement.setString(28, record.sourcePayload().toString());
      return statement;
    }, keyHolder);
    return requiredKey(keyHolder, "satellite_catalog_history");
  }

  public void insertRemovedHistory(long versionId, long syncRunId, int noradCatalogId) {
    jdbc.update("""
        insert into satellite_catalog_history(
          catalog_version_id,
          sync_run_id,
          norad_cat_id,
          record_type)
        values (?, ?, ?, 'REMOVED')
        """,
        versionId,
        syncRunId,
        noradCatalogId);
  }

  private void setInstant(PreparedStatement statement, int index, Instant value) throws java.sql.SQLException {
    if (value == null) {
      statement.setNull(index, Types.TIMESTAMP_WITH_TIMEZONE);
    } else {
      statement.setTimestamp(index, Timestamp.from(value));
    }
  }

  private void setInteger(PreparedStatement statement, int index, Integer value) throws java.sql.SQLException {
    if (value == null) {
      statement.setNull(index, Types.INTEGER);
    } else {
      statement.setInt(index, value);
    }
  }

  private long requiredKey(KeyHolder keyHolder, String tableName) {
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new IllegalStateException("Insert into " + tableName + " did not return a generated key");
    }
    return key.longValue();
  }
}
