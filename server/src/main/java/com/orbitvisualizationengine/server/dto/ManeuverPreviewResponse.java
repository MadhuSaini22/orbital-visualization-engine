package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import java.util.List;

public record ManeuverPreviewResponse(
    ManeuverEvent maneuver,
    List<EphemerisState> preBurnTrajectory,
    List<EphemerisState> postBurnTrajectory,
    List<String> warnings) {
}
