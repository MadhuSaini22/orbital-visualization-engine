package com.orbitvisualizationengine.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "orbit")
public record AppProperties(
    String celestrakBaseUrl,
    String spaceTrackBaseUrl,
    String spaceTrackUsername,
    String spaceTrackPassword,
    String orekitDataPath,
    boolean ingestionEnabled,
    String corsOriginPattern,
    boolean missionTimelinePropagationEnabled) {
}
