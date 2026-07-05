package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.springframework.stereotype.Component;

@Component
public class DefaultScreeningExecutor implements ScreeningExecutor {
  @Override
  public ScreeningExecutionStatistics execute(List<Runnable> tasks) {
    if (tasks == null) {
      throw new IllegalArgumentException("Screening tasks are required");
    }

    List<Runnable> copiedTasks = List.copyOf(tasks);
    if (copiedTasks.isEmpty()) {
      return new ScreeningExecutionStatistics(0, 0, 0);
    }

    try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
      List<Future<?>> futures = copiedTasks.stream()
          .map(executor::submit)
          .toList();
      return collectResults(futures);
    }
  }

  private static ScreeningExecutionStatistics collectResults(List<Future<?>> futures) {
    long successfulTasks = 0;
    List<Throwable> failures = new ArrayList<>();

    for (Future<?> future : futures) {
      try {
        future.get();
        successfulTasks++;
      } catch (InterruptedException exception) {
        Thread.currentThread().interrupt();
        failures.add(exception);
      } catch (ExecutionException exception) {
        failures.add(exception.getCause() == null ? exception : exception.getCause());
      }
    }

    long failedTasks = futures.size() - successfulTasks;
    if (!failures.isEmpty()) {
      ConjunctionException failure = new ConjunctionException(
          "Catalog screening execution failed for " + failedTasks + " of " + futures.size() + " candidates");
      failures.forEach(failure::addSuppressed);
      throw failure;
    }
    return new ScreeningExecutionStatistics(futures.size(), successfulTasks, 0);
  }
}
