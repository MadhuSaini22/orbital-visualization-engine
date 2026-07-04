package com.orbitvisualizationengine.server.catalog.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogRepository;
import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogSatelliteRecord;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class CatalogRepositoryTest {
  @Test
  void findByNoradIdReadsOnlyPublishedProjection() {
    RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();
    CatalogRepository repository = new CatalogRepository(jdbc);
    CatalogSatelliteRecord record = CatalogRuntimeTestFixtures.record(25544, "ISS");
    jdbc.records = List.of(record);

    Optional<CatalogSatelliteRecord> result = repository.findByNoradId(25544);

    assertThat(result).contains(record);
    assertThat(jdbc.lastSql()).contains("from satellite_catalog sc");
    assertThat(jdbc.lastSql()).contains("join satellite_catalog_history h on h.id = sc.current_history_id");
    assertThat(jdbc.lastSql()).contains("join catalog_versions cv on cv.id = sc.current_version_id");
    assertThat(jdbc.lastSql()).contains("cv.status = 'AVAILABLE'");
    assertThat(jdbc.lastSql()).contains("h.record_type = 'TLE'");
    assertThat(jdbc.lastSql()).contains("sc.norad_cat_id = ?");
    assertThat(jdbc.lastArgs()).containsExactly(25544);
  }

  @Test
  void findByNameEscapesLikeWildcards() {
    RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();
    CatalogRepository repository = new CatalogRepository(jdbc);

    repository.findByName("ISS_%");

    assertThat(jdbc.lastArgs()).containsExactly("%iss\\_\\%%");
  }

  @Test
  void countReadsPublishedProjectionOnly() {
    RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();
    CatalogRepository repository = new CatalogRepository(jdbc);
    jdbc.count = 42L;

    assertThat(repository.count()).isEqualTo(42L);

    assertThat(jdbc.lastSql()).contains("from satellite_catalog");
    assertThat(jdbc.lastSql()).doesNotContain("join");
  }

  @Test
  void existsReadsPublishedProjectionOnly() {
    RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();
    CatalogRepository repository = new CatalogRepository(jdbc);
    jdbc.exists = true;

    assertThat(repository.exists(25544)).isTrue();

    assertThat(jdbc.lastSql()).contains("from satellite_catalog");
    assertThat(jdbc.lastSql()).contains("where norad_cat_id = ?");
    assertThat(jdbc.lastSql()).doesNotContain("join");
    assertThat(jdbc.lastArgs()).containsExactly(25544);
  }

  @Test
  void streamUsesPublishedProjectionQuery() {
    RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();
    CatalogRepository repository = new CatalogRepository(jdbc);

    try (Stream<CatalogSatelliteRecord> ignored = repository.stream()) {
      assertThat(ignored).isNotNull();
    }

    assertThat(jdbc.lastSql()).contains("cv.status = 'AVAILABLE'");
    assertThat(jdbc.lastSql()).contains("order by sc.norad_cat_id");
  }

  private static final class RecordingJdbcTemplate extends JdbcTemplate {
    private final List<String> sqlCalls = new ArrayList<>();
    private final List<Object[]> argsCalls = new ArrayList<>();
    private List<CatalogSatelliteRecord> records = List.of();
    private long count;
    private boolean exists;

    @Override
    public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
      sqlCalls.add(sql);
      argsCalls.add(args);
      return records.stream().map(record -> (T) record).toList();
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> rowMapper) {
      sqlCalls.add(sql);
      argsCalls.add(new Object[0]);
      return records.stream().map(record -> (T) record).toList();
    }

    @Override
    public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
      sqlCalls.add(sql);
      argsCalls.add(args);
      Object result = requiredType == Boolean.class ? exists : count;
      return requiredType.cast(result);
    }

    @Override
    public <T> T queryForObject(String sql, Class<T> requiredType) {
      sqlCalls.add(sql);
      argsCalls.add(new Object[0]);
      Object result = requiredType == Boolean.class ? exists : count;
      return requiredType.cast(result);
    }

    @Override
    public <T> Stream<T> queryForStream(String sql, RowMapper<T> rowMapper) {
      sqlCalls.add(sql);
      argsCalls.add(new Object[0]);
      return records.stream().map(record -> (T) record);
    }

    private String lastSql() {
      return sqlCalls.getLast();
    }

    private Object[] lastArgs() {
      return argsCalls.getLast();
    }
  }
}
