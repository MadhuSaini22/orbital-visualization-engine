package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.ManualOrbitRecord;
import com.orbitvisualizationengine.server.domain.OrbitDefinitionType;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ManualOrbitRepository {
  private final JdbcTemplate jdbc;

  public ManualOrbitRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public ManualOrbitRecord save(ManualOrbitRecord orbit) {
    jdbc.update("""
        insert into manual_orbits(id, name, type, epoch, frame, central_body, payload, propagator_type, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
        on conflict (id) do update set
          name = excluded.name,
          type = excluded.type,
          epoch = excluded.epoch,
          frame = excluded.frame,
          central_body = excluded.central_body,
          payload = excluded.payload,
          propagator_type = excluded.propagator_type,
          updated_at = excluded.updated_at
        """,
        orbit.id(),
        orbit.name(),
        orbit.type().name(),
        orbit.epoch() == null ? null : Timestamp.from(orbit.epoch()),
        orbit.frame(),
        orbit.centralBody(),
        orbit.payload(),
        orbit.propagatorType().name(),
        Timestamp.from(orbit.createdAt()),
        Timestamp.from(orbit.updatedAt()));
    return orbit;
  }

  public Optional<ManualOrbitRecord> findById(String id) {
    List<ManualOrbitRecord> rows = jdbc.query("""
        select id, name, type, epoch, frame, central_body, payload::text, propagator_type, created_at, updated_at
        from manual_orbits
        where id = ?
        """, this::map, id);
    return rows.stream().findFirst();
  }

  private ManualOrbitRecord map(ResultSet rs, int rowNum) throws SQLException {
    Timestamp epoch = rs.getTimestamp("epoch");
    return new ManualOrbitRecord(
        rs.getString("id"),
        rs.getString("name"),
        OrbitDefinitionType.valueOf(rs.getString("type")),
        epoch == null ? null : epoch.toInstant(),
        rs.getString("frame"),
        rs.getString("central_body"),
        rs.getString("payload"),
        PropagatorType.valueOf(rs.getString("propagator_type")),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }
}
