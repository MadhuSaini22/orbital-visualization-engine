package com.orbitvisualizationengine.server.catalog.ingestion.repository;

import com.orbitvisualizationengine.server.catalog.ingestion.CurrentCatalogRecord;
import com.orbitvisualizationengine.server.catalog.ingestion.NormalizedCatalogRecord;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SatelliteCatalogRepository {
  private final JdbcTemplate jdbc;

  public SatelliteCatalogRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<CurrentCatalogRecord> loadCurrentCatalog(long sourceId) {
    return jdbc.query("""
        select sc.norad_cat_id, h.tle_sha256, sc.first_seen_version_id, sc.first_seen_at
        from satellite_catalog sc
        join satellite_catalog_history h on h.id = sc.current_history_id
        join catalog_versions cv on cv.id = h.catalog_version_id
        where cv.source_id = ?
        """, (rs, rowNum) -> new CurrentCatalogRecord(
            rs.getInt("norad_cat_id"),
            rs.getString("tle_sha256"),
            rs.getLong("first_seen_version_id"),
            rs.getTimestamp("first_seen_at").toInstant()), sourceId);
  }

  public void upsertProjection(long versionId, long historyId, NormalizedCatalogRecord record) {
    jdbc.update("""
        insert into satellite_catalog(
          norad_cat_id,
          current_history_id,
          current_version_id,
          first_seen_version_id,
          last_seen_version_id)
        values (?, ?, ?, ?, ?)
        on conflict (norad_cat_id) do update set
          current_history_id = excluded.current_history_id,
          current_version_id = excluded.current_version_id,
          last_seen_version_id = excluded.last_seen_version_id,
          last_seen_at = now(),
          updated_at = now()
        """,
        record.noradCatalogId(),
        historyId,
        versionId,
        versionId,
        versionId);
  }

  public void deleteProjection(int noradCatalogId) {
    int deleted = jdbc.update("""
        delete from satellite_catalog
        where norad_cat_id = ?
        """, noradCatalogId);
    requireUpdated(deleted, "satellite_catalog", noradCatalogId);
  }

  public void markSeen(long versionId, int noradCatalogId) {
    int updated = jdbc.update("""
        update satellite_catalog
        set last_seen_version_id = ?,
            last_seen_at = now(),
            updated_at = now()
        where norad_cat_id = ?
        """, versionId, noradCatalogId);
    requireUpdated(updated, "satellite_catalog", noradCatalogId);
  }

  private void requireUpdated(int updatedRows, String tableName, Object id) {
    if (updatedRows != 1) {
      throw new IllegalStateException("Expected to update one " + tableName + " row for " + id + " but updated " + updatedRows);
    }
  }
}
