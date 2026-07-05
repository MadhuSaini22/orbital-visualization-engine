package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

@Component
public class DefaultCatalogConjunctionEngine implements CatalogConjunctionEngine {
  private final CatalogService catalogService;
  private final ConjunctionService conjunctionService;

  public DefaultCatalogConjunctionEngine(
      CatalogService catalogService,
      ConjunctionService conjunctionService) {
    this.catalogService = catalogService;
    this.conjunctionService = conjunctionService;
  }

  @Override
  public CatalogConjunctionResult screen(
      CatalogConjunctionRequest request,
      CatalogSatellite primarySatellite) {
    if (request == null) {
      throw new IllegalArgumentException("Catalog conjunction request is required");
    }
    if (primarySatellite == null) {
      throw new IllegalArgumentException("Primary satellite is required");
    }

    ScreeningAccumulator accumulator = new ScreeningAccumulator();
    try (Stream<CatalogSatellite> satellites = catalogService.stream()) {
      satellites.forEach(candidate -> screenCandidate(request, candidate, accumulator));
    }
    accumulator.candidates.sort(Comparator.comparingDouble(
        candidate -> candidate.conjunctionResult().closestApproach().missDistanceMeters()));

    return new CatalogConjunctionResult(
        request,
        primarySatellite,
        accumulator.candidates,
        accumulator.statistics());
  }

  private void screenCandidate(
      CatalogConjunctionRequest request,
      CatalogSatellite candidate,
      ScreeningAccumulator accumulator) {
    accumulator.catalogSatellitesSeen++;
    if (candidate.noradCatalogId() == request.primaryNoradCatalogId()) {
      accumulator.skippedPrimarySatellites++;
      return;
    }

    accumulator.analyzedCandidates++;
    ConjunctionResult conjunctionResult = conjunctionService.analyze(conjunctionRequest(request, candidate));
    if (conjunctionResult.status() == ConjunctionStatus.CONJUNCTION) {
      accumulator.conjunctionCandidates++;
      accumulator.candidates.add(new CatalogConjunctionCandidate(candidate, conjunctionResult));
    } else {
      accumulator.clearCandidates++;
    }
  }

  private static ConjunctionRequest conjunctionRequest(
      CatalogConjunctionRequest request,
      CatalogSatellite candidate) {
    return new ConjunctionRequest(
        request.primaryNoradCatalogId(),
        candidate.noradCatalogId(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.relativeFrame(),
        request.missDistanceThresholdMeters());
  }

  private static final class ScreeningAccumulator {
    private final List<CatalogConjunctionCandidate> candidates = new ArrayList<>();
    private long catalogSatellitesSeen;
    private long skippedPrimarySatellites;
    private long analyzedCandidates;
    private long conjunctionCandidates;
    private long clearCandidates;

    private CatalogScreeningStatistics statistics() {
      return new CatalogScreeningStatistics(
          catalogSatellitesSeen,
          skippedPrimarySatellites,
          analyzedCandidates,
          conjunctionCandidates,
          clearCandidates);
    }
  }
}
