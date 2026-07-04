package com.orbitvisualizationengine.server.catalog.ingestion.repository;

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
public class CatalogVersionRepository {
  private final JdbcTemplate jdbc;

  public CatalogVersionRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public long createImportingVersion(
      long sourceId,
      Instant epochMin,
      Instant epochMax,
      int totalObjects,
      int activeObjects,
      int changedObjects,
      int addedObjects,
      int removedObjects,
      String catalogSha256) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          insert into catalog_versions(
            source_id,
            status,
            source_epoch_min,
            source_epoch_max,
            total_objects,
            active_objects,
            changed_objects,
            added_objects,
            removed_objects,
            catalog_sha256)
          values (?, 'IMPORTING', ?, ?, ?, ?, ?, ?, ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, sourceId);
      setInstant(statement, 2, epochMin);
      setInstant(statement, 3, epochMax);
      statement.setInt(4, totalObjects);
      statement.setInt(5, activeObjects);
      statement.setInt(6, changedObjects);
      statement.setInt(7, addedObjects);
      statement.setInt(8, removedObjects);
      statement.setString(9, catalogSha256);
      return statement;
    }, keyHolder);
    return requiredKey(keyHolder, "catalog_versions");
  }

  public void publishVersion(long versionId) {
    int updated = jdbc.update("""
        update catalog_versions
        set status = 'AVAILABLE',
            published_at = now()
        where id = ?
          and status = 'IMPORTING'
        """, versionId);
    requireUpdated(updated, "catalog_versions", versionId);
  }

  private void setInstant(PreparedStatement statement, int index, Instant value) throws java.sql.SQLException {
    if (value == null) {
      statement.setNull(index, Types.TIMESTAMP_WITH_TIMEZONE);
    } else {
      statement.setTimestamp(index, Timestamp.from(value));
    }
  }

  private long requiredKey(KeyHolder keyHolder, String tableName) {
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new IllegalStateException("Insert into " + tableName + " did not return a generated key");
    }
    return key.longValue();
  }

  private void requireUpdated(int updatedRows, String tableName, Object id) {
    if (updatedRows != 1) {
      throw new IllegalStateException("Expected to update one " + tableName + " row for " + id + " but updated " + updatedRows);
    }
  }
}
