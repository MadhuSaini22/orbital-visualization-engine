package com.orbitvisualizationengine.server.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.CatalogFetchRequest;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderRegistry;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSource;
import com.orbitvisualizationengine.server.catalog.provider.dto.ProviderTleRecord;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.impl.CelestrakCatalogSource;
import com.orbitvisualizationengine.server.config.AppProperties;
import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.OrbitElementRecord;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.SatelliteAnalysisConfig;
import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceDiagnosticsSample;
import com.orbitvisualizationengine.server.propagation.EphemerisCache;
import com.orbitvisualizationengine.server.propagation.KeplerianPropagator;
import com.orbitvisualizationengine.server.propagation.NumericalPropagator;
import com.orbitvisualizationengine.server.propagation.OrbitPropagator;
import com.orbitvisualizationengine.server.propagation.PropagationContext;
import com.orbitvisualizationengine.server.propagation.SGP4Propagator;
import com.orbitvisualizationengine.server.propagation.SpacecraftModel;
import com.orbitvisualizationengine.server.repository.ManeuverRepository;
import com.orbitvisualizationengine.server.repository.SatelliteRepository;
import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.orekit.data.DataContext;
import org.orekit.data.DirectoryCrawler;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.time.DateComponents;
import org.orekit.time.OffsetModel;
import org.orekit.time.TimeScalesFactory;
import org.springframework.stereotype.Service;

@Service
public class OrekitOrbitAnalysisService implements OrbitAnalysisService {
  private final SatelliteRepository satellites;
  private final ManeuverRepository maneuvers;
  private final CatalogProviderRegistry providerRegistry;
  private final ObjectMapper mapper;
  private final AnalysisConfigService analysisConfigService;
  private final SGP4Propagator sgp4Propagator;
  private final KeplerianPropagator keplerianPropagator;
  private final NumericalPropagator numericalPropagator;
  private final EphemerisCache ephemerisCache;

  public OrekitOrbitAnalysisService(
      SatelliteRepository satellites,
      ManeuverRepository maneuvers,
      CatalogProviderRegistry providerRegistry,
      ObjectMapper mapper,
      AnalysisConfigService analysisConfigService,
      SGP4Propagator sgp4Propagator,
      KeplerianPropagator keplerianPropagator,
      NumericalPropagator numericalPropagator,
      EphemerisCache ephemerisCache,
      AppProperties properties) {
    this.satellites = satellites;
    this.maneuvers = maneuvers;
    this.providerRegistry = providerRegistry;
    this.mapper = mapper;
    this.analysisConfigService = analysisConfigService;
    this.sgp4Propagator = sgp4Propagator;
    this.keplerianPropagator = keplerianPropagator;
    this.numericalPropagator = numericalPropagator;
    this.ephemerisCache = ephemerisCache;
    if (!properties.orekitDataPath().isBlank()) {
      DataContext.getDefault().getDataProvidersManager().addProvider(new DirectoryCrawler(new File(properties.orekitDataPath())));
    } else {
      TimeScalesFactory.addUTCTAIOffsetsLoader(this::utcTaiOffsets);
    }
  }

  @Override
  public List<EphemerisState> propagate(int noradId, Instant start, Instant end, int stepSeconds) {
    try {
      PropagationContext context = buildContext(noradId);
      OrbitPropagator propagator = selectPropagator(context.analysisConfig().propagatorType());
      return ephemerisCache.get(noradId, propagator.name(), context.analysisConfig(), start, end, stepSeconds)
          .orElseGet(() -> ephemerisCache.put(
              noradId,
              propagator.name(),
              context.analysisConfig(),
              start,
              end,
              stepSeconds,
              propagator.trajectory(context, start, end, stepSeconds)));
    } catch (RuntimeException exception) {
      throw propagationFailure(noradId, exception);
    }
  }

  @Override
  public EphemerisState currentState(int noradId, Instant time) {
    try {
      PropagationContext context = buildContext(noradId);
      return selectPropagator(context.analysisConfig().propagatorType()).propagate(context, time);
    } catch (RuntimeException exception) {
      throw propagationFailure(noradId, exception);
    }
  }

  public List<ForceDiagnosticsSample> forceDiagnostics(int noradId, Instant start, Instant end, int stepSeconds) {
    try {
      PropagationContext context = buildContext(noradId);
      if (context.analysisConfig().propagatorType() != PropagatorType.NUMERICAL) {
        throw new IllegalArgumentException("Force diagnostics require NUMERICAL propagation for NORAD " + noradId);
      }

      List<ForceDiagnosticsSample> samples = new ArrayList<>();
      for (Instant cursor = start; !cursor.isAfter(end); cursor = cursor.plusSeconds(stepSeconds)) {
        samples.add(numericalPropagator.diagnosticsAt(context, cursor));
      }
      return samples;
    } catch (IllegalArgumentException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      throw propagationFailure(noradId, exception);
    }
  }

  public List<PropagationComparison> compare(int noradId, Instant start, Instant end, int stepSeconds) {
    try {
      PropagationContext context = buildContext(noradId);
      return List.of(
          new PropagationComparison(sgp4Propagator.name(), sgp4Propagator.trajectory(context, start, end, stepSeconds)),
          new PropagationComparison(keplerianPropagator.name(), keplerianPropagator.trajectory(context, start, end, stepSeconds)),
          new PropagationComparison(numericalPropagator.name(), numericalPropagator.trajectory(context, start, end, stepSeconds)));
    } catch (RuntimeException exception) {
      throw propagationFailure(noradId, exception);
    }
  }

  private PropagationContext buildContext(int noradId) {
    return buildContext(noradId, true);
  }

  public PropagationContext buildContext(int noradId, boolean includeLegacyManeuvers) {
    SatelliteAnalysisConfig config = analysisConfigService.getOrCreate(noradId);
    return new PropagationContext(
        noradId,
        loadTle(noradId),
        config,
        SpacecraftModel.fromConfig(config),
        includeLegacyManeuvers ? maneuvers.findByNoradId(noradId) : List.of());
  }

  private OrbitPropagator selectPropagator(PropagatorType type) {
    return switch (type) {
      case KEPLERIAN -> keplerianPropagator;
      case NUMERICAL -> numericalPropagator;
      case TLE_SGP4 -> sgp4Propagator;
    };
  }

  private TLE loadTle(int noradId) {
    OrbitElementRecord element = satellites.findLatestOrbitElement(noradId).orElse(null);
    if (element == null || !"TLE".equals(element.format())) {
      ProviderTleRecord tleText = fetchTleByNoradId(noradId);
      Instant now = Instant.now();
      satellites.upsertSatellite(new SatelliteRecord(noradId, tleText.objectName(), "payload", null, "celestrak", now));
      satellites.upsertOrbitElement(new OrbitElementRecord("celestrak-tle-" + noradId + "-" + now.toEpochMilli(), noradId, "TLE",
          null, tleText.rawPayload().toString(), now));
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

  private ProviderTleRecord fetchTleByNoradId(int noradId) {
    if (noradId <= 0) {
      throw new IllegalArgumentException("NORAD catalog ID must be positive");
    }
    CatalogFetchRequest request = new CatalogFetchRequest(
        CatalogEndpoint.NORAD_TLE,
        CatalogDataFormat.TLE,
        Map.of(),
        Map.of("noradId", noradId));
    TleCatalogResponse response = (TleCatalogResponse) celestrak().fetch(request).body();
    return response.records().stream()
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("CelesTrak did not return a complete TLE for NORAD " + noradId));
  }

  private CatalogSource celestrak() {
    return providerRegistry.require(CelestrakCatalogSource.PROVIDER_CODE);
  }

  public record PropagationComparison(String model, List<EphemerisState> states) {
  }

  private IllegalStateException propagationFailure(int noradId, RuntimeException exception) {
    return new IllegalStateException(
        "Propagation failed for NORAD " + noradId + ": " + rootMessage(exception),
        exception);
  }

  private String rootMessage(Throwable throwable) {
    Throwable cursor = throwable;
    while (cursor.getCause() != null) {
      cursor = cursor.getCause();
    }
    String message = cursor.getMessage();
    return message == null || message.isBlank() ? cursor.getClass().getSimpleName() : message;
  }

  private List<OffsetModel> utcTaiOffsets() {
    return List.of(
        leap(1972, 1, 1, 10),
        leap(1972, 7, 1, 11),
        leap(1973, 1, 1, 12),
        leap(1974, 1, 1, 13),
        leap(1975, 1, 1, 14),
        leap(1976, 1, 1, 15),
        leap(1977, 1, 1, 16),
        leap(1978, 1, 1, 17),
        leap(1979, 1, 1, 18),
        leap(1980, 1, 1, 19),
        leap(1981, 7, 1, 20),
        leap(1982, 7, 1, 21),
        leap(1983, 7, 1, 22),
        leap(1985, 7, 1, 23),
        leap(1988, 1, 1, 24),
        leap(1990, 1, 1, 25),
        leap(1991, 1, 1, 26),
        leap(1992, 7, 1, 27),
        leap(1993, 7, 1, 28),
        leap(1994, 7, 1, 29),
        leap(1996, 1, 1, 30),
        leap(1997, 7, 1, 31),
        leap(1999, 1, 1, 32),
        leap(2006, 1, 1, 33),
        leap(2009, 1, 1, 34),
        leap(2012, 7, 1, 35),
        leap(2015, 7, 1, 36),
        leap(2017, 1, 1, 37));
  }

  private OffsetModel leap(int year, int month, int day, int taiMinusUtcSeconds) {
    return new OffsetModel(new DateComponents(year, month, day), taiMinusUtcSeconds);
  }
}
