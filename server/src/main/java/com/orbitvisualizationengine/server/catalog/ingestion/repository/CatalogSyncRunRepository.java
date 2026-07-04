package com.orbitvisualizationengine.server.catalog.ingestion.repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogSyncRunRepository {
  private final JdbcTemplate jdbc;

  public CatalogSyncRunRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public long createRunningSyncRun(long versionId, long sourceId, int fetchedElementSets, int parsedElementSets) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          insert into catalog_sync_runs(
            catalog_version_id,
            source_id,
            status,
            fetched_element_sets,
            parsed_element_sets)
          values (?, ?, 'RUNNING', ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setLong(1, versionId);
      statement.setLong(2, sourceId);
      statement.setInt(3, fetchedElementSets);
      statement.setInt(4, parsedElementSets);
      return statement;
    }, keyHolder);
    return requiredKey(keyHolder, "catalog_sync_runs");
  }

  public void completeSucceededSyncRun(
      long syncRunId,
      int insertedHistoryRows,
      int updatedActiveRows,
      int unchangedActiveRows,
      int removedActiveRows) {
    int updated = jdbc.update("""
        update catalog_sync_runs
        set status = 'SUCCEEDED',
            finished_at = now(),
            inserted_history_rows = ?,
            updated_active_rows = ?,
            unchanged_active_rows = ?,
            removed_active_rows = ?
        where id = ?
          and status = 'RUNNING'
        """,
        insertedHistoryRows,
        updatedActiveRows,
        unchangedActiveRows,
        removedActiveRows,
        syncRunId);
    requireUpdated(updated, "catalog_sync_runs", syncRunId);
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
