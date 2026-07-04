package com.orbitvisualizationengine.server.catalog.provider.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record CelestrakGpElement(
    @JsonAlias("OBJECT_NAME") String objectName,
    @JsonAlias("OBJECT_ID") String objectId,
    @JsonAlias("NORAD_CAT_ID") int noradCatalogId,
    @JsonAlias("OBJECT_TYPE") String objectType,
    @JsonAlias("EPOCH") String epoch,
    @JsonAlias("MEAN_MOTION") Double meanMotion,
    @JsonAlias("ECCENTRICITY") Double eccentricity,
    @JsonAlias("INCLINATION") Double inclination,
    @JsonAlias("RA_OF_ASC_NODE") Double raan,
    @JsonAlias("ARG_OF_PERICENTER") Double argumentOfPerigee,
    @JsonAlias("MEAN_ANOMALY") Double meanAnomaly,
    @JsonAlias("EPHEMERIS_TYPE") Integer ephemerisType,
    @JsonAlias("CLASSIFICATION_TYPE") String classification,
    @JsonAlias("COUNTRY_CODE") String countryCode,
    @JsonAlias("BSTAR") Double bstar,
    @JsonAlias("MEAN_MOTION_DOT") Double meanMotionDot,
    @JsonAlias("MEAN_MOTION_DDOT") Double meanMotionDdot) {
}
