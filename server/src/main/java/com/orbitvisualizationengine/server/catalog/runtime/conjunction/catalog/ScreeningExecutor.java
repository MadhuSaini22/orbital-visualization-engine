package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import java.util.List;

public interface ScreeningExecutor {
  ScreeningExecutionStatistics execute(List<Runnable> tasks);
}
