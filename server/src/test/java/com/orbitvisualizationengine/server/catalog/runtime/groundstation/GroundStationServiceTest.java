package com.orbitvisualizationengine.server.catalog.runtime.groundstation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.exception.GroundStationNotFoundException;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository.GroundStationRepository;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class GroundStationServiceTest {
  @Test
  void findByIdReturnsConfiguredStation() {
    GroundStation station = station("goldstone");
    GroundStationService service = new GroundStationService(new FakeGroundStationRepository(List.of(station)));

    assertThat(service.findById(new GroundStationId("goldstone"))).isEqualTo(station);
  }

  @Test
  void findByIdRejectsNullId() {
    GroundStationService service = new GroundStationService(new FakeGroundStationRepository(List.of()));

    assertThatThrownBy(() -> service.findById(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Ground station id is required");
  }

  @Test
  void findByIdThrowsDomainExceptionWhenMissing() {
    GroundStationService service = new GroundStationService(new FakeGroundStationRepository(List.of()));

    assertThatThrownBy(() -> service.findById(new GroundStationId("missing")))
        .isInstanceOf(GroundStationNotFoundException.class)
        .hasMessage("No runtime ground station exists for id missing");
  }

  @Test
  void supportsFindAllExistsAndStream() {
    GroundStation station = station("goldstone");
    GroundStationService service = new GroundStationService(new FakeGroundStationRepository(List.of(station)));

    assertThat(service.findAll()).containsExactly(station);
    assertThat(service.exists(new GroundStationId("goldstone"))).isTrue();
    assertThat(service.exists(new GroundStationId("madrid"))).isFalse();
    try (Stream<GroundStation> stream = service.stream()) {
      assertThat(stream.map(GroundStation::id).map(GroundStationId::value)).containsExactly("goldstone");
    }
  }

  static GroundStation station(String id) {
    return new GroundStation(
        new GroundStationId(id),
        id,
        new GroundStationPosition(35.2472, -116.7933, 1006.0),
        GroundStationConfiguration.empty());
  }

  private static final class FakeGroundStationRepository implements GroundStationRepository {
    private final List<GroundStation> stations;

    private FakeGroundStationRepository(List<GroundStation> stations) {
      this.stations = stations;
    }

    @Override
    public Optional<GroundStation> findById(GroundStationId id) {
      return stations.stream()
          .filter(station -> station.id().equals(id))
          .findFirst();
    }

    @Override
    public List<GroundStation> findAll() {
      return stations;
    }

    @Override
    public boolean exists(GroundStationId id) {
      return stations.stream().anyMatch(station -> station.id().equals(id));
    }

    @Override
    public Stream<GroundStation> stream() {
      return stations.stream();
    }
  }
}
