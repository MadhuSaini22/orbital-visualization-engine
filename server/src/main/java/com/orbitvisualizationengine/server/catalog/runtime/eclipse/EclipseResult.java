package com.orbitvisualizationengine.server.catalog.runtime.eclipse;

import java.util.List;

public record EclipseResult(
    EclipseRequest request,
    List<EclipseInterval> intervals) {
  public EclipseResult {
    if (request == null) {
      throw new IllegalArgumentException("Eclipse request is required");
    }
    if (intervals == null) {
      throw new IllegalArgumentException("Eclipse intervals are required");
    }
    intervals = List.copyOf(intervals);
  }
}
