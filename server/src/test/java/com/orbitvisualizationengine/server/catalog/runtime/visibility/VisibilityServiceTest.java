package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStation;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationConfiguration;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationPosition;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationService;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.repository.GroundStationRepository;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationEngine;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class VisibilityServiceTest {
  private static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  private static final Instant STOP = Instant.parse("2026-05-08T04:49:05Z");

  @Test
  void coordinatesRuntimeSatelliteGroundStationPropagationAndVisibilityEngine() {
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    GroundStation groundStation = station();
    RecordingVisibilityEngine visibilityEngine = new RecordingVisibilityEngine();
    VisibilityService service = new VisibilityService(
        new FakeRuntimeSatelliteService(satellite),
        new GroundStationService(new FakeGroundStationRepository(groundStation)),
        new PropagationService(new FakePropagationEngine()),
        visibilityEngine);
    VisibilityRequest request = request();

    VisibilityResult result = service.computeVisibility(request);

    assertThat(visibilityEngine.request).isSameAs(request);
    assertThat(visibilityEngine.satellite).isSameAs(satellite);
    assertThat(visibilityEngine.groundStation).isSameAs(groundStation);
    assertThat(visibilityEngine.propagationResult.states()).hasSize(3);
    assertThat(result.windows()).containsExactly(VisibilityModelTest.window(START, STOP));
  }

  @Test
  void rejectsNullRequest() {
    VisibilityService service = new VisibilityService(
        new FakeRuntimeSatelliteService(PropagationTestFixtures.runtimeSatellite()),
        new GroundStationService(new FakeGroundStationRepository(station())),
        new PropagationService(new FakePropagationEngine()),
        new RecordingVisibilityEngine());

    assertThatThrownBy(() -> service.computeVisibility(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Visibility request is required");
  }

  private static VisibilityRequest request() {
    return new VisibilityRequest(
        25544,
        new GroundStationId("goldstone"),
        START,
        STOP,
        Duration.ofSeconds(60),
        0.0);
  }

  private static GroundStation station() {
    return new GroundStation(
        new GroundStationId("goldstone"),
        "Goldstone",
        new GroundStationPosition(35.2472, -116.7933, 1006.0),
        GroundStationConfiguration.empty());
  }

  private static final class FakeRuntimeSatelliteService extends RuntimeSatelliteService {
    private final RuntimeSatellite satellite;

    private FakeRuntimeSatelliteService(RuntimeSatellite satellite) {
      super(null, null);
      this.satellite = satellite;
    }

    @Override
    public RuntimeSatellite findByNoradId(int noradCatalogId) {
      return satellite;
    }
  }

  private static final class FakeGroundStationRepository implements GroundStationRepository {
    private final GroundStation station;

    private FakeGroundStationRepository(GroundStation station) {
      this.station = station;
    }

    @Override
    public Optional<GroundStation> findById(GroundStationId id) {
      return station.id().equals(id) ? Optional.of(station) : Optional.empty();
    }

    @Override
    public List<GroundStation> findAll() {
      return List.of(station);
    }

    @Override
    public boolean exists(GroundStationId id) {
      return station.id().equals(id);
    }

    @Override
    public Stream<GroundStation> stream() {
      return Stream.of(station);
    }
  }

  private static final class FakePropagationEngine implements PropagationEngine {
    @Override
    public List<PropagatedState> propagate(RuntimeSatellite satellite, List<Instant> sampleTimes) {
      return sampleTimes.stream()
          .map(time -> new PropagatedState(
              time,
              "TEME",
              new CartesianVector(1.0, 2.0, 3.0),
              new CartesianVector(4.0, 5.0, 6.0)))
          .toList();
    }
  }

  private static final class RecordingVisibilityEngine implements VisibilityEngine {
    private VisibilityRequest request;
    private RuntimeSatellite satellite;
    private GroundStation groundStation;
    private PropagationResult propagationResult;

    @Override
    public VisibilityResult computeVisibility(
        VisibilityRequest request,
        RuntimeSatellite satellite,
        GroundStation groundStation,
        PropagationResult propagationResult) {
      this.request = request;
      this.satellite = satellite;
      this.groundStation = groundStation;
      this.propagationResult = propagationResult;
      return new VisibilityResult(request, List.of(VisibilityModelTest.window(START, STOP)));
    }
  }
}
