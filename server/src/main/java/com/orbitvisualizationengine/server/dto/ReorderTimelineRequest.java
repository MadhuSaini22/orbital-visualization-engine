package com.orbitvisualizationengine.server.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ReorderTimelineRequest(@NotEmpty List<String> eventIds) {
}
