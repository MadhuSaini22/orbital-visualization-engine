package com.orbitvisualizationengine.server.repository;

import com.orbitvisualizationengine.server.domain.ConjunctionRecord;
import com.orbitvisualizationengine.server.domain.RiskLevel;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ConjunctionRepository {
  private final JdbcTemplate jdbc;

  public ConjunctionRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void upsert(ConjunctionRecord record) {
    jdbc.update("""
        insert into conjunctions(
          id, sat1_norad_id, sat2_norad_id, sat1_name, sat2_name, created_at, tca,
          miss_distance_km, probability_of_collision, relative_velocity_kmps, risk, source, raw_cdm
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
        on conflict (id) do update set
          tca = excluded.tca,
          miss_distance_km = excluded.miss_distance_km,
          probability_of_collision = excluded.probability_of_collision,
          relative_velocity_kmps = excluded.relative_velocity_kmps,
          risk = excluded.risk,
          raw_cdm = excluded.raw_cdm
        """,
        record.id(),
        record.sat1NoradId(),
        record.sat2NoradId(),
        record.sat1Name(),
        record.sat2Name(),
        record.createdAt() == null ? null : Timestamp.from(record.createdAt()),
        Timestamp.from(record.tca()),
        record.missDistanceKm(),
        record.probabilityOfCollision(),
        record.relativeVelocityKmps(),
        record.risk().name(),
        record.source(),
        record.rawCdm());
  }

  public List<ConjunctionRecord> search(Integer noradId, RiskLevel risk, Instant from, Instant to) {
    return search(noradId, null, risk, from, to);
  }

  public List<ConjunctionRecord> search(Integer noradId, List<Integer> noradIds, RiskLevel risk, Instant from, Instant to) {
    List<Object> args = new ArrayList<>();
    StringBuilder sql = new StringBuilder("select * from conjunctions where 1=1");

    if (noradId != null) {
      sql.append(" and (sat1_norad_id = ? or sat2_norad_id = ?)");
      args.add(noradId);
      args.add(noradId);
    }
    if (noradIds != null && !noradIds.isEmpty()) {
      String placeholders = String.join(", ", java.util.Collections.nCopies(noradIds.size(), "?"));
      sql.append(" and sat1_norad_id in (").append(placeholders).append(") and sat2_norad_id in (").append(placeholders).append(")");
      args.addAll(noradIds);
      args.addAll(noradIds);
    }
    if (risk != null) {
      sql.append(" and risk = ?");
      args.add(risk.name());
    }
    if (from != null) {
      sql.append(" and tca >= ?");
      args.add(Timestamp.from(from));
    }
    if (to != null) {
      sql.append(" and tca <= ?");
      args.add(Timestamp.from(to));
    }

    sql.append(" order by tca asc limit 250");
    return jdbc.query(sql.toString(), this::map, args.toArray());
  }

  public List<ConjunctionRecord> findById(String id) {
    return jdbc.query("select * from conjunctions where id = ?", this::map, id);
  }

  private ConjunctionRecord map(ResultSet rs, int rowNum) throws SQLException {
    Timestamp createdAt = rs.getTimestamp("created_at");
    return new ConjunctionRecord(
        rs.getString("id"),
        nullableInteger(rs, "sat1_norad_id"),
        nullableInteger(rs, "sat2_norad_id"),
        rs.getString("sat1_name"),
        rs.getString("sat2_name"),
        createdAt == null ? null : createdAt.toInstant(),
        rs.getTimestamp("tca").toInstant(),
        nullableDouble(rs, "miss_distance_km"),
        nullableDouble(rs, "probability_of_collision"),
        nullableDouble(rs, "relative_velocity_kmps"),
        RiskLevel.valueOf(rs.getString("risk")),
        rs.getString("source"),
        rs.getString("raw_cdm"));
  }

  private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
    Object value = rs.getObject(column);
    return value == null ? null : ((Number) value).doubleValue();
  }

  private static Integer nullableInteger(ResultSet rs, String column) throws SQLException {
    Object value = rs.getObject(column);
    return value == null ? null : ((Number) value).intValue();
  }
}
