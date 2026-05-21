package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.util.List;

public record PropagationResponse(int noradId, String model, String frame, List<EphemerisState> states) {
}
