package com.orbitvisualizationengine.server.catalog.runtime.visibility;

import java.util.List;

public record VisibilityResult(
    VisibilityRequest request,
    List<VisibilityWindow> windows) {
  public VisibilityResult {
    if (request == null) {
      throw new IllegalArgumentException("Visibility request is required");
    }
    if (windows == null) {
      throw new IllegalArgumentException("Visibility windows are required");
    }
    windows = List.copyOf(windows);
  }
}
