package com.orbitvisualizationengine.server.catalog.runtime.conjunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

public class ConjunctionModelTest {
  public static final Instant START = Instant.parse("2026-05-08T04:47:05Z");
  public static final Instant STOP = Instant.parse("2026-05-08T04:57:05Z");

  @Test
  void validatesRequest() {
    assertThatThrownBy(() -> new ConjunctionRequest(
        25544,
        25544,
        START,
        STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN,
        1000.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Primary and secondary satellites must be different");

    assertThatThrownBy(() -> new ConjunctionRequest(
        25544,
        20580,
        START,
        STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN,
        -1.0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Miss-distance threshold must be non-negative");
  }

  @Test
  void defaultsRelativeFrame() {
    ConjunctionRequest request = new ConjunctionRequest(
        25544,
        20580,
        START,
        STOP,
        Duration.ofSeconds(60),
        null,
        1000.0);

    assertThat(request.relativeFrame()).isEqualTo(RelativeFrame.LVLH_RTN);
  }

  @Test
  void validatesClosestApproachConsistency() {
    RelativeState state = relativeState(START, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);

    ClosestApproach closestApproach = new ClosestApproach(START, 10.0, 2.0, state);

    assertThat(closestApproach.timeOfClosestApproach()).isEqualTo(START);
    assertThatThrownBy(() -> new ClosestApproach(STOP, 10.0, 2.0, state))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Time of closest approach must match the relative state timestamp");
  }

  public static ConjunctionRequest request(double thresholdMeters) {
    return new ConjunctionRequest(
        25544,
        20580,
        START,
        STOP,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN,
        thresholdMeters);
  }

  public static RelativeState relativeState(
      Instant timestamp,
      double rx,
      double ry,
      double rz,
      double vx,
      double vy,
      double vz) {
    return new RelativeState(
        timestamp,
        RelativeFrame.LVLH_RTN,
        new CartesianVector(rx, ry, rz),
        new CartesianVector(vx, vy, vz));
  }
}
