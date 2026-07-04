package com.orbitvisualizationengine.server.catalog.ingestion.repository;

import com.orbitvisualizationengine.server.catalog.provider.CatalogSourceDescriptor;
import java.sql.PreparedStatement;
import java.sql.Statement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogSourceRepository {
  private final JdbcTemplate jdbc;

  public CatalogSourceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public long ensureSource(CatalogSourceDescriptor source) {
    Long existing = jdbc.query("""
        select id
        from catalog_sources
        where code = ?
        """, rs -> rs.next() ? rs.getLong("id") : null, source.code());
    if (existing != null) {
      int updated = jdbc.update("""
          update catalog_sources
          set display_name = ?, provider_type = ?, base_url = ?, updated_at = now()
          where id = ?
          """,
          source.displayName(),
          source.providerType().name(),
          source.baseUri() == null ? null : source.baseUri().toString(),
          existing);
      requireUpdated(updated, "catalog_sources", existing);
      return existing;
    }

    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(connection -> {
      PreparedStatement statement = connection.prepareStatement("""
          insert into catalog_sources(code, display_name, provider_type, base_url)
          values (?, ?, ?, ?)
          """, Statement.RETURN_GENERATED_KEYS);
      statement.setString(1, source.code());
      statement.setString(2, source.displayName());
      statement.setString(3, source.providerType().name());
      statement.setString(4, source.baseUri() == null ? null : source.baseUri().toString());
      return statement;
    }, keyHolder);
    return requiredKey(keyHolder, "catalog_sources");
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
