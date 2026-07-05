package com.orbitvisualizationengine.server.catalog.runtime.relativemotion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RelativeMotionModelTest {
  static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  static final Instant STOP = Instant.parse("2026-05-08T04:57:05Z");

  @Test
  void validatesRequest() {
    assertThatThrownBy(() -> new RelativeMotionRequest(
        25544,
        25544,
        START,
        STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary and secondary satellites must be different");

    assertThatThrownBy(() -> new RelativeMotionRequest(
        25544,
        20580,
        STOP,
        START,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Stop time must be greater than or equal to start time");
  }

  @Test
  void defaultsFrameToLvlhRtn() {
    RelativeMotionRequest request = new RelativeMotionRequest(
        25544,
        20580,
        START,
        STOP,
        Duration.ofSeconds(60),
        null);

    assertThat(request.frame()).isEqualTo(RelativeFrame.LVLH_RTN);
  }

  @Test
  void resultDefensivelyCopiesStates() {
    RelativeMotionRequest request = request();
    List<RelativeState> states = new ArrayList<>();
    states.add(state(START));

    RelativeMotionResult result = new RelativeMotionResult(request, states);
    states.clear();

    assertThat(result.states()).hasSize(1);
    assertThatThrownBy(() -> result.states().add(state(STOP)))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  static RelativeMotionRequest request() {
    return new RelativeMotionRequest(
        25544,
        20580,
        START,
        STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN);
  }

  static RelativeState state(Instant timestamp) {
    return new RelativeState(
        timestamp,
        RelativeFrame.LVLH_RTN,
        new CartesianVector(1.0, 2.0, 3.0),
        new CartesianVector(4.0, 5.0, 6.0));
  }
}
