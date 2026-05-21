package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import java.time.Instant;
import java.util.List;

public record SatelliteListResponse(String source, Instant updatedAt, List<SatelliteRecord> satellites) {
}
