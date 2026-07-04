package com.orbitvisualizationengine.server.catalog.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.exception.CatalogSatelliteNotFoundException;
import com.orbitvisualizationengine.server.catalog.runtime.mapper.CatalogSatelliteMapper;
import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogRepository;
import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogSatelliteRecord;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CatalogServiceTest {
  private final CatalogSatelliteMapper mapper = new CatalogSatelliteMapper();

  @Test
  void findByNoradIdReturnsMappedSatellite() {
    FakeCatalogRepository repository = new FakeCatalogRepository();
    CatalogService service = new CatalogService(repository, mapper);
    repository.records = List.of(CatalogRuntimeTestFixtures.record(25544, "ISS"));

    CatalogSatellite satellite = service.findByNoradId(25544);

    assertThat(satellite.noradCatalogId()).isEqualTo(25544);
    assertThat(satellite.objectName()).isEqualTo("ISS");
  }

  @Test
  void findByNoradIdRejectsInvalidIds() {
    FakeCatalogRepository repository = new FakeCatalogRepository();
    CatalogService service = new CatalogService(repository, mapper);

    assertThatThrownBy(() -> service.findByNoradId(0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("NORAD catalog id must be positive");
  }

  @Test
  void findByNoradIdThrowsDomainExceptionWhenMissing() {
    FakeCatalogRepository repository = new FakeCatalogRepository();
    CatalogService service = new CatalogService(repository, mapper);

    assertThatThrownBy(() -> service.findByNoradId(99999))
        .isInstanceOf(CatalogSatelliteNotFoundException.class)
        .hasMessage("No published catalog satellite exists for NORAD catalog id 99999");
  }

  @Test
  void findByNameTrimsInputAndMapsResults() {
    FakeCatalogRepository repository = new FakeCatalogRepository();
    CatalogService service = new CatalogService(repository, mapper);
    repository.records = List.of(CatalogRuntimeTestFixtures.record(25544, "ISS"));

    List<CatalogSatellite> satellites = service.findByName("  ISS  ");

    assertThat(satellites).extracting(CatalogSatellite::objectName).containsExactly("ISS");
    assertThat(repository.nameQueries).containsExactly("ISS");
  }

  @Test
  void supportsExistsCountAndStream() {
    FakeCatalogRepository repository = new FakeCatalogRepository();
    CatalogService service = new CatalogService(repository, mapper);
    repository.records = List.of(CatalogRuntimeTestFixtures.record(25544, "ISS"));

    assertThat(service.exists(25544)).isTrue();
    assertThat(service.count()).isEqualTo(1);
    try (Stream<CatalogSatellite> stream = service.stream()) {
      assertThat(stream.map(CatalogSatellite::noradCatalogId)).containsExactly(25544);
    }
  }

  private static final class FakeCatalogRepository extends CatalogRepository {
    private List<CatalogSatelliteRecord> records = List.of();
    private final List<String> nameQueries = new ArrayList<>();

    private FakeCatalogRepository() {
      super(null);
    }

    @Override
    public Optional<CatalogSatelliteRecord> findByNoradId(int noradCatalogId) {
      return records.stream()
          .filter(record -> record.noradCatalogId() == noradCatalogId)
          .findFirst();
    }

    @Override
    public List<CatalogSatelliteRecord> findByName(String nameQuery) {
      nameQueries.add(nameQuery);
      return records;
    }

    @Override
    public boolean exists(int noradCatalogId) {
      return records.stream().anyMatch(record -> record.noradCatalogId() == noradCatalogId);
    }

    @Override
    public long count() {
      return records.size();
    }

    @Override
    public Stream<CatalogSatelliteRecord> stream() {
      return records.stream();
    }
  }
}
