package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.domain.ManeuverStatus;
import com.orbitvisualizationengine.server.util.JsonUtil;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ManeuverRepository {
  private final JdbcTemplate jdbc;
  private final JsonUtil json;

  public ManeuverRepository(JdbcTemplate jdbc, JsonUtil json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public void save(ManeuverEvent maneuver) {
    jdbc.update("""
        insert into maneuvers(id, norad_id, name, status, event_time, delta_v_mps, duration_sec, frame, vector, metadata)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
        on conflict (id) do update set
          status = excluded.status,
          event_time = excluded.event_time,
          delta_v_mps = excluded.delta_v_mps,
          duration_sec = excluded.duration_sec,
          frame = excluded.frame,
          vector = excluded.vector,
          metadata = excluded.metadata
        """,
        maneuver.id(),
        maneuver.noradId(),
        maneuver.name(),
        maneuver.status().name(),
        Timestamp.from(maneuver.eventTime()),
        maneuver.deltaVMps(),
        maneuver.durationSec(),
        maneuver.frame(),
        json.write(maneuver.vector()),
        json.write(maneuver.metadata()));
  }

  public List<ManeuverEvent> findByNoradId(Integer noradId) {
    if (noradId == null) {
      return jdbc.query("select * from maneuvers order by event_time desc limit 100", this::map);
    }
    return jdbc.query("select * from maneuvers where norad_id = ? order by event_time desc", this::map, noradId);
  }

  private ManeuverEvent map(ResultSet rs, int rowNum) throws SQLException {
    return new ManeuverEvent(
        rs.getString("id"),
        rs.getInt("norad_id"),
        rs.getString("name"),
        ManeuverStatus.valueOf(rs.getString("status")),
        rs.getTimestamp("event_time").toInstant(),
        rs.getDouble("delta_v_mps"),
        rs.getInt("duration_sec"),
        rs.getString("frame"),
        json.readDoubleMap(rs.getString("vector")),
        json.readObjectMap(rs.getString("metadata")));
  }
}
