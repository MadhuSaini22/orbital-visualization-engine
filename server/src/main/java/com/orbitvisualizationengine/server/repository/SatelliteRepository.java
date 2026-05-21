package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.OrbitElementRecord;
import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SatelliteRepository {
  private final JdbcTemplate jdbc;

  public SatelliteRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void upsertSatellite(SatelliteRecord satellite) {
    jdbc.update("""
        insert into satellites(norad_id, name, object_type, owner, source, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict (norad_id) do update set
          name = excluded.name,
          object_type = excluded.object_type,
          owner = excluded.owner,
          source = excluded.source,
          updated_at = excluded.updated_at
        """,
        satellite.noradId(),
        satellite.name(),
        satellite.objectType(),
        satellite.owner(),
        satellite.source(),
        Timestamp.from(satellite.updatedAt()));
  }

  public void upsertOrbitElement(OrbitElementRecord element) {
    jdbc.update("""
        insert into orbit_elements(id, norad_id, format, epoch, raw_payload, ingested_at)
        values (?, ?, ?, ?, ?::jsonb, ?)
        on conflict (id) do update set
          epoch = excluded.epoch,
          raw_payload = excluded.raw_payload,
          ingested_at = excluded.ingested_at
        """,
        element.id(),
        element.noradId(),
        element.format(),
        element.epoch() == null ? null : Timestamp.from(element.epoch()),
        element.rawPayload(),
        Timestamp.from(element.ingestedAt()));
  }

  public void upsertCatalogMembership(String groupId, int noradId, Instant refreshedAt) {
    jdbc.update("""
        insert into catalog_memberships(group_id, norad_id, refreshed_at)
        values (?, ?, ?)
        on conflict (group_id, norad_id) do update set
          refreshed_at = excluded.refreshed_at
        """,
        groupId,
        noradId,
        Timestamp.from(refreshedAt));
  }

  public List<SatelliteRecord> findAll(int limit) {
    return jdbc.query("""
        select norad_id, name, object_type, owner, source, updated_at
        from satellites
        order by name
        limit ?
        """, this::mapSatellite, limit);
  }

  public List<SatelliteRecord> findByGroup(String groupId, int limit) {
    return jdbc.query("""
        select s.norad_id, s.name, s.object_type, s.owner, s.source, s.updated_at
        from catalog_memberships cm
        join satellites s on s.norad_id = cm.norad_id
        where cm.group_id = ?
        order by s.name
        limit ?
        """, this::mapSatellite, groupId, limit);
  }

  public Optional<SatelliteRecord> findByNoradId(int noradId) {
    List<SatelliteRecord> rows = jdbc.query("""
        select norad_id, name, object_type, owner, source, updated_at
        from satellites
        where norad_id = ?
        """, this::mapSatellite, noradId);
    return rows.stream().findFirst();
  }

  public Optional<OrbitElementRecord> findLatestOrbitElement(int noradId) {
    List<OrbitElementRecord> rows = jdbc.query("""
        select id, norad_id, format, epoch, raw_payload::text, ingested_at
        from orbit_elements
        where norad_id = ?
        order by epoch desc nulls last, ingested_at desc
        limit 1
        """, this::mapOrbitElement, noradId);
    return rows.stream().findFirst();
  }

  public List<CatalogTleRecord> findLatestTlesByGroup(String groupId, int limit) {
    return jdbc.query("""
        select s.norad_id, s.name, e.raw_payload::text
        from catalog_memberships cm
        join satellites s on s.norad_id = cm.norad_id
        join lateral (
          select raw_payload
          from orbit_elements
          where norad_id = s.norad_id
            and format = 'TLE'
          order by epoch desc nulls last, ingested_at desc
          limit 1
        ) e on true
        where cm.group_id = ?
        order by s.name
        limit ?
        """, (rs, rowNum) -> new CatalogTleRecord(
            rs.getInt("norad_id"),
            rs.getString("name"),
            rs.getString("raw_payload")), groupId, limit);
  }

  private SatelliteRecord mapSatellite(ResultSet rs, int rowNum) throws SQLException {
    return new SatelliteRecord(
        rs.getInt("norad_id"),
        rs.getString("name"),
        rs.getString("object_type"),
        rs.getString("owner"),
        rs.getString("source"),
        rs.getTimestamp("updated_at").toInstant());
  }

  private OrbitElementRecord mapOrbitElement(ResultSet rs, int rowNum) throws SQLException {
    Timestamp epoch = rs.getTimestamp("epoch");
    return new OrbitElementRecord(
        rs.getString("id"),
        rs.getInt("norad_id"),
        rs.getString("format"),
        epoch == null ? null : epoch.toInstant(),
        rs.getString("raw_payload"),
        rs.getTimestamp("ingested_at").toInstant());
  }

  public record CatalogTleRecord(int noradId, String name, String rawPayload) {
  }
}
