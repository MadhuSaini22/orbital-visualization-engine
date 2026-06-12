package com.orbitvisualizationengine.server.dto;

import com.orbitvisualizationengine.server.domain.ManeuverTemplateType;
import java.util.List;
import java.util.Map;

public record ManeuverTemplateApplyResponse(
    ManeuverTemplateType type,
    String templateInstanceId,
    Map<String, Object> metadata,
    List<String> warnings,
    List<MissionTimelineEventResponse> events) {
}
