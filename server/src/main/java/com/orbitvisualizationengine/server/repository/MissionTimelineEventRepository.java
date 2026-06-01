package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.util.JsonUtil;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MissionTimelineEventRepository {
  private final JdbcTemplate jdbc;
  private final JsonUtil json;

  public MissionTimelineEventRepository(JdbcTemplate jdbc, JsonUtil json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public MissionTimelineEvent save(MissionTimelineEvent event) {
    jdbc.update("""
        insert into mission_timeline_events(
          id, mission_id, sequence_index, type, name, enabled, execution_time, parameters, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
        on conflict (id) do update set
          sequence_index = excluded.sequence_index,
          type = excluded.type,
          name = excluded.name,
          enabled = excluded.enabled,
          execution_time = excluded.execution_time,
          parameters = excluded.parameters,
          updated_at = excluded.updated_at
        """,
        event.id(),
        event.missionId(),
        event.sequenceIndex(),
        event.type().name(),
        event.name(),
        event.enabled(),
        Timestamp.from(event.executionTime()),
        json.write(event.parameters()),
        Timestamp.from(event.createdAt()),
        Timestamp.from(event.updatedAt()));
    return event;
  }

  public Optional<MissionTimelineEvent> findById(String missionId, String eventId) {
    return jdbc.query(
        "select * from mission_timeline_events where mission_id = ? and id = ?",
        this::map,
        missionId,
        eventId).stream().findFirst();
  }

  public List<MissionTimelineEvent> findByMissionId(String missionId) {
    return jdbc.query(
        "select * from mission_timeline_events where mission_id = ? order by sequence_index asc",
        this::map,
        missionId);
  }

  public void resequence(String missionId, List<String> eventIds) {
    int temporaryOffset = Math.max(1_000_000, eventIds.size() * 2);
    for (int index = 0; index < eventIds.size(); index++) {
      jdbc.update("""
          update mission_timeline_events
          set sequence_index = ?, updated_at = now()
          where mission_id = ? and id = ?
          """, temporaryOffset + index, missionId, eventIds.get(index));
    }
    for (int index = 0; index < eventIds.size(); index++) {
      jdbc.update("""
          update mission_timeline_events
          set sequence_index = ?, updated_at = now()
          where mission_id = ? and id = ?
          """, index, missionId, eventIds.get(index));
    }
  }

  public void delete(String missionId, String eventId) {
    jdbc.update("delete from mission_timeline_events where mission_id = ? and id = ?", missionId, eventId);
  }

  private MissionTimelineEvent map(ResultSet rs, int rowNum) throws SQLException {
    return new MissionTimelineEvent(
        rs.getString("id"),
        rs.getString("mission_id"),
        rs.getInt("sequence_index"),
        TimelineEventType.valueOf(rs.getString("type")),
        rs.getString("name"),
        rs.getBoolean("enabled"),
        rs.getTimestamp("execution_time").toInstant(),
        json.readObjectMap(rs.getString("parameters")),
        timestampOrNow(rs, "created_at"),
        timestampOrNow(rs, "updated_at"));
  }

  private Instant timestampOrNow(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? Instant.now() : timestamp.toInstant();
  }
}
