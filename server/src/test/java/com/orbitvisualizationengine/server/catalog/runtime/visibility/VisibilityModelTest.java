package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class VisibilityModelTest {
  private static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  private static final Instant STOP = Instant.parse("2026-05-08T05:47:05Z");

  @Test
  void validatesVisibilityRequest() {
    assertThatThrownBy(() -> new VisibilityRequest(
        0,
        new GroundStationId("goldstone"),
        START,
        STOP,
        Duration.ofSeconds(60),
        0.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("NORAD");

    assertThatThrownBy(() -> new VisibilityRequest(
        25544,
        new GroundStationId("goldstone"),
        STOP,
        START,
        Duration.ofSeconds(60),
        0.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Stop time");

    assertThatThrownBy(() -> new VisibilityRequest(
        25544,
        new GroundStationId("goldstone"),
        START,
        STOP,
        Duration.ZERO,
        0.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("positive");

    assertThatThrownBy(() -> new VisibilityRequest(
        25544,
        new GroundStationId("goldstone"),
        START,
        STOP,
        Duration.ofSeconds(60),
        91.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Minimum elevation");
  }

  @Test
  void visibilityWindowComputesDurationWhenMissing() {
    VisibilityWindow window = new VisibilityWindow(
        START,
        STOP,
        START.plusSeconds(120),
        42.0,
        null);

    assertThat(window.duration()).isEqualTo(Duration.between(START, STOP));
  }

  @Test
  void visibilityResultDefensivelyCopiesWindows() {
    VisibilityRequest request = request();
    List<VisibilityWindow> windows = new ArrayList<>();
    windows.add(window(START, STOP));

    VisibilityResult result = new VisibilityResult(request, windows);
    windows.add(window(START, STOP.plusSeconds(60)));

    assertThat(result.windows()).hasSize(1);
    assertThatThrownBy(() -> result.windows().add(window(START, STOP)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  static VisibilityRequest request() {
    return new VisibilityRequest(
        25544,
        new GroundStationId("goldstone"),
        START,
        STOP,
        Duration.ofSeconds(60),
        0.0);
  }

  static VisibilityWindow window(Instant aos, Instant los) {
    return new VisibilityWindow(aos, los, aos, 10.0, Duration.between(aos, los));
  }
}
