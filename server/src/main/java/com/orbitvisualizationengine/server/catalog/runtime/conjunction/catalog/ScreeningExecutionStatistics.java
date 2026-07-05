package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

public record ScreeningExecutionStatistics(
    long submittedTasks,
    long successfulTasks,
    long failedTasks) {
  public ScreeningExecutionStatistics {
    if (submittedTasks < 0) {
      throw new IllegalArgumentException("Submitted tasks must be non-negative");
    }
    if (successfulTasks < 0) {
      throw new IllegalArgumentException("Successful tasks must be non-negative");
    }
    if (failedTasks < 0) {
      throw new IllegalArgumentException("Failed tasks must be non-negative");
    }
    if (submittedTasks != successfulTasks + failedTasks) {
      throw new IllegalArgumentException("Submitted tasks must equal successful plus failed tasks");
    }
  }
}
