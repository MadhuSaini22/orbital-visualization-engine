package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.ConjunctionRecord;
import java.util.List;

public record ConjunctionListResponse(List<ConjunctionRecord> conjunctions) {
}
