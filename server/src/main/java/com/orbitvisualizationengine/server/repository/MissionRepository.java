package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.Mission;
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
public class MissionRepository {
  private final JdbcTemplate jdbc;

  public MissionRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Mission save(Mission mission) {
    jdbc.update("""
        insert into missions(id, name, propagator_type, scenario_start, scenario_end, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do update set
          name = excluded.name,
          propagator_type = excluded.propagator_type,
          scenario_start = excluded.scenario_start,
          scenario_end = excluded.scenario_end,
          updated_at = excluded.updated_at
        """,
        mission.id(),
        mission.name(),
        mission.propagatorType().name(),
        Timestamp.from(mission.scenarioStart()),
        Timestamp.from(mission.scenarioEnd()),
        Timestamp.from(mission.createdAt()),
        Timestamp.from(mission.updatedAt()));
    return mission;
  }

  public Optional<Mission> findById(String id) {
    return jdbc.query("select * from missions where id = ?", this::map, id).stream().findFirst();
  }

  public Optional<Mission> lockById(String id) {
    return jdbc.query("select * from missions where id = ? for update", this::map, id).stream().findFirst();
  }

  public List<Mission> findAll() {
    return jdbc.query("select * from missions order by updated_at desc", this::map);
  }

  private Mission map(ResultSet rs, int rowNum) throws SQLException {
    return new Mission(
        rs.getString("id"),
        rs.getString("name"),
        PropagatorType.valueOf(rs.getString("propagator_type")),
        rs.getTimestamp("scenario_start").toInstant(),
        rs.getTimestamp("scenario_end").toInstant(),
        timestampOrNow(rs, "created_at"),
        timestampOrNow(rs, "updated_at"));
  }

  private Instant timestampOrNow(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? Instant.now() : timestamp.toInstant();
  }
}
