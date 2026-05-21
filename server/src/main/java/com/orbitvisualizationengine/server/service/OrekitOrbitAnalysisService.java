package com.orbitvisualizationengine.server.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.config.AppProperties;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.OrbitElementRecord;
import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import com.orbitvisualizationengine.server.ingestion.CelesTrakClient;
import com.orbitvisualizationengine.server.repository.SatelliteRepository;
import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.orekit.bodies.GeodeticPoint;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.data.DataContext;
import org.orekit.data.DirectoryCrawler;
import org.orekit.frames.Frame;
import org.orekit.frames.FramesFactory;
import org.orekit.propagation.Propagator;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;
import org.orekit.utils.PVCoordinates;
import org.springframework.stereotype.Service;

@Service
public class OrekitOrbitAnalysisService implements OrbitAnalysisService {
  private final SatelliteRepository satellites;
  private final CelesTrakClient celesTrak;
  private final ObjectMapper mapper;

  public OrekitOrbitAnalysisService(
      SatelliteRepository satellites,
      CelesTrakClient celesTrak,
      ObjectMapper mapper,
      AppProperties properties) {
    this.satellites = satellites;
    this.celesTrak = celesTrak;
    this.mapper = mapper;
    if (!properties.orekitDataPath().isBlank()) {
      DataContext.getDefault().getDataProvidersManager().addProvider(new DirectoryCrawler(new File(properties.orekitDataPath())));
    }
  }

  @Override
  public List<EphemerisState> propagate(int noradId, Instant start, Instant end, int stepSeconds) {
    TLE tle = loadTle(noradId);
    Propagator propagator = TLEPropagator.selectExtrapolator(tle);
    List<EphemerisState> states = new ArrayList<>();
    for (Instant cursor = start; !cursor.isAfter(end); cursor = cursor.plusSeconds(stepSeconds)) {
      states.add(propagateOne(propagator, cursor));
    }
    return states;
  }

  @Override
  public EphemerisState currentState(int noradId, Instant time) {
    TLE tle = loadTle(noradId);
    return propagateOne(TLEPropagator.selectExtrapolator(tle), time);
  }

  private TLE loadTle(int noradId) {
    OrbitElementRecord element = satellites.findLatestOrbitElement(noradId).orElse(null);
    if (element == null || !"TLE".equals(element.format())) {
      CelesTrakClient.TleText tleText = celesTrak.fetchTleByNoradId(noradId);
      Instant now = Instant.now();
      satellites.upsertSatellite(new SatelliteRecord(noradId, tleText.name(), "payload", null, "celestrak", now));
      satellites.upsertOrbitElement(new OrbitElementRecord("celestrak-tle-" + noradId + "-" + now.toEpochMilli(), noradId, "TLE",
          null, tleText.rawPayload(), now));
      return new TLE(tleText.line1(), tleText.line2());
    }

    String raw = element.rawPayload();
    try {
      JsonNode payload = mapper.readTree(raw);
      String line1 = payload.path("line1").asText();
      String line2 = payload.path("line2").asText();
      if (line1.isBlank() || line2.isBlank()) {
        throw new IllegalStateException("Stored TLE payload is incomplete for NORAD " + noradId);
      }
      return new TLE(line1, line2);
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Stored TLE payload is not valid JSON for NORAD " + noradId, exception);
    }
  }

  private EphemerisState propagateOne(Propagator propagator, Instant instant) {
    AbsoluteDate date = new AbsoluteDate(java.util.Date.from(instant), TimeScalesFactory.getUTC());
    Frame itrf = FramesFactory.getITRF(IERSConventions.IERS_2010, true);
    OneAxisEllipsoid earth = new OneAxisEllipsoid(
        Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
        Constants.WGS84_EARTH_FLATTENING,
        itrf);

    PVCoordinates fixedPv = propagator.getPVCoordinates(date, itrf);
    Vector3D position = fixedPv.getPosition();
    Vector3D velocity = fixedPv.getVelocity();
    GeodeticPoint point = earth.transform(position, itrf, date);

    return new EphemerisState(
        instant,
        "ITRF",
        new double[] {position.getX() / 1000.0, position.getY() / 1000.0, position.getZ() / 1000.0},
        new double[] {velocity.getX() / 1000.0, velocity.getY() / 1000.0, velocity.getZ() / 1000.0},
        Math.toDegrees(point.getLatitude()),
        Math.toDegrees(point.getLongitude()),
        point.getAltitude() / 1000.0);
  }
}
