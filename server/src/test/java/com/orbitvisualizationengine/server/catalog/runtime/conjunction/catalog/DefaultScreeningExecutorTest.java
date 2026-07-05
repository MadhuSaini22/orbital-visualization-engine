package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.junit.jupiter.api.Test;

class DefaultScreeningExecutorTest {
  @Test
  void executesIndependentTasksAndReturnsStatistics() {
    ConcurrentLinkedQueue<Integer> completed = new ConcurrentLinkedQueue<>();
    ScreeningExecutionStatistics statistics = new DefaultScreeningExecutor().execute(List.of(
        () -> completed.add(1),
        () -> completed.add(2),
        () -> completed.add(3)));

    assertThat(completed).containsExactlyInAnyOrder(1, 2, 3);
    assertThat(statistics).isEqualTo(new ScreeningExecutionStatistics(3, 3, 0));
  }

  @Test
  void surfacesTaskFailures() {
    RuntimeException failure = new RuntimeException("candidate failed");

    assertThatThrownBy(() -> new DefaultScreeningExecutor().execute(List.of(
        () -> {
        },
        () -> {
          throw failure;
        })))
        .isInstanceOf(ConjunctionException.class)
        .hasMessage("Catalog screening execution failed for 1 of 2 candidates")
        .satisfies(exception -> assertThat(exception.getSuppressed())
            .anySatisfy(suppressed -> assertThat(suppressed).isSameAs(failure)));
  }
}
