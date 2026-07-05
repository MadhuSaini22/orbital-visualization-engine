package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class EclipseModelTest {
  static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  static final Instant STOP = Instant.parse("2026-05-08T05:47:05Z");

  @Test
  void validatesRequestTimeSpanAndStep() {
    assertThatThrownBy(() -> new EclipseRequest(25544, STOP, START, Duration.ofSeconds(60)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Stop time must be greater than or equal to start time");

    assertThatThrownBy(() -> new EclipseRequest(25544, START, STOP, Duration.ZERO))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Step duration must be positive");
  }

  @Test
  void intervalComputesAndVerifiesDuration() {
    EclipseInterval interval = interval(EclipseType.UMBRA, START, STOP);

    assertThat(interval.duration()).isEqualTo(Duration.ofHours(1));

    assertThatThrownBy(() -> new EclipseInterval(
        EclipseType.UMBRA,
        START,
        STOP,
        Duration.ofMinutes(1)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Duration must match the interval time span");
  }

  @Test
  void resultDefensivelyCopiesIntervals() {
    EclipseRequest request = request();
    List<EclipseInterval> intervals = new ArrayList<>();
    intervals.add(interval(EclipseType.SUNLIGHT, START, STOP));

    EclipseResult result = new EclipseResult(request, intervals);
    intervals.clear();

    assertThat(result.intervals()).hasSize(1);
    assertThatThrownBy(() -> result.intervals().add(interval(EclipseType.UMBRA, START, STOP)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  static EclipseRequest request() {
    return new EclipseRequest(25544, START, STOP, Duration.ofSeconds(60));
  }

  static EclipseInterval interval(EclipseType type, Instant startTime, Instant stopTime) {
    return new EclipseInterval(type, startTime, stopTime, null);
  }
}
