package com.orbitvisualizationengine.server.catalog.runtime.relativemotion.orekit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationTestFixtures;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionException;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class OrekitRelativeMotionEngineTest {
  private final OrekitRelativeMotionEngine engine = new OrekitRelativeMotionEngine();

  @Test
  void computesLvlhRtnRelativePositionAndVelocity() {
    RelativeMotionRequest request = request();
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    PropagationResult primary = propagation(
        satellite,
        state(request.startTime(), 7_000_000.0, 0.0, 0.0, 0.0, 7500.0, 0.0));
    PropagationResult secondary = propagation(
        satellite,
        state(request.startTime(), 7_000_010.0, 20.0, 30.0, 1.0, 7502.0, 3.0));

    RelativeMotionResult result = engine.computeRelativeMotion(request, primary, secondary);

    assertThat(result.states()).hasSize(1);
    RelativeState relativeState = result.states().getFirst();
    assertThat(relativeState.relativePosition().xMeters()).isCloseTo(10.0, withinMeters());
    assertThat(relativeState.relativePosition().yMeters()).isCloseTo(20.0, withinMeters());
    assertThat(relativeState.relativePosition().zMeters()).isCloseTo(30.0, withinMeters());
    assertThat(relativeState.relativeVelocity().xMeters()).isCloseTo(1.0214285714, withinMeters());
    assertThat(relativeState.relativeVelocity().yMeters()).isCloseTo(1.9892857143, withinMeters());
    assertThat(relativeState.relativeVelocity().zMeters()).isCloseTo(3.0, withinMeters());
  }

  @Test
  void rejectsMismatchedSampleTimes() {
    RelativeMotionRequest request = request();
    RuntimeSatellite satellite = PropagationTestFixtures.runtimeSatellite();
    PropagationResult primary = propagation(
        satellite,
        state(request.startTime(), 7_000_000.0, 0.0, 0.0, 0.0, 7500.0, 0.0));
    PropagationResult secondary = propagation(
        satellite,
        state(request.startTime().plusSeconds(1), 7_000_010.0, 20.0, 30.0, 1.0, 7502.0, 3.0));

    assertThatThrownBy(() -> engine.computeRelativeMotion(request, primary, secondary))
        .isInstanceOf(RelativeMotionException.class)
        .hasMessage("Primary and secondary propagation sample times must match");
  }

  private static PropagationResult propagation(RuntimeSatellite satellite, PropagatedState state) {
    return new PropagationResult(
        satellite,
        state.timestamp(),
        state.timestamp(),
        Duration.ofSeconds(60),
        List.of(state));
  }

  private static RelativeMotionRequest request() {
    Instant start = Instant.parse("2026-05-08T04:47:05Z");
    return new RelativeMotionRequest(
        25544,
        20580,
        start,
        start,
        Duration.ofSeconds(60),
        RelativeFrame.LVLH_RTN);
  }

  private static PropagatedState state(
      Instant timestamp,
      double px,
      double py,
      double pz,
      double vx,
      double vy,
      double vz) {
    return new PropagatedState(
        timestamp,
        "TEME",
        new CartesianVector(px, py, pz),
        new CartesianVector(vx, vy, vz));
  }

  private static org.assertj.core.data.Offset<Double> withinMeters() {
    return org.assertj.core.data.Offset.offset(1.0e-9);
  }
}
