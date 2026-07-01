const MEAN_EARTH_RADIUS_METERS = 6371000;

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function satelliteHorizonRadiusMeters(altitudeKm: number) {
  const altitudeMeters = Math.max(0, altitudeKm * 1000);
  if (altitudeMeters <= 0) {
    return 0;
  }

  const satelliteRadiusMeters = MEAN_EARTH_RADIUS_METERS + altitudeMeters;
  const centralAngleRad = Math.acos(clampUnit(MEAN_EARTH_RADIUS_METERS / satelliteRadiusMeters));
  return MEAN_EARTH_RADIUS_METERS * centralAngleRad;
}

export function stationAccessRadiusMeters(
  satelliteAltitudeKm: number,
  minimumElevationDeg: number,
  stationAltitudeKm: number,
) {
  const satelliteAltitudeMeters = Math.max(0, satelliteAltitudeKm * 1000);
  if (satelliteAltitudeMeters <= 0) {
    return 0;
  }

  const stationRadiusMeters = MEAN_EARTH_RADIUS_METERS + Math.max(0, stationAltitudeKm * 1000);
  const satelliteRadiusMeters = MEAN_EARTH_RADIUS_METERS + satelliteAltitudeMeters;
  if (satelliteRadiusMeters <= stationRadiusMeters) {
    return 0;
  }

  const minimumElevationRad = Math.max(0, Math.min(89.9, minimumElevationDeg)) * Math.PI / 180;
  const centralAngleRad = Math.acos(
    clampUnit((stationRadiusMeters / satelliteRadiusMeters) * Math.cos(minimumElevationRad)),
  ) - minimumElevationRad;

  return Math.max(0, MEAN_EARTH_RADIUS_METERS * centralAngleRad);
}
