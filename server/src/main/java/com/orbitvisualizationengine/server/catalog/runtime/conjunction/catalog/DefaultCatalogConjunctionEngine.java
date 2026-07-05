package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial.SpatialCandidateResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial.SpatialIndexEngine;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.springframework.stereotype.Component;

@Component
public class DefaultCatalogConjunctionEngine implements CatalogConjunctionEngine {
  private final SpatialIndexEngine spatialIndexEngine;
  private final ConjunctionService conjunctionService;
  private final ScreeningExecutor screeningExecutor;

  public DefaultCatalogConjunctionEngine(
      SpatialIndexEngine spatialIndexEngine,
      ConjunctionService conjunctionService,
      ScreeningExecutor screeningExecutor) {
    this.spatialIndexEngine = spatialIndexEngine;
    this.conjunctionService = conjunctionService;
    this.screeningExecutor = screeningExecutor;
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
    SpatialCandidateResult spatialCandidates = spatialIndexEngine.findCandidates(primarySatellite);
    accumulator.catalogSatellitesSeen = spatialCandidates.spatialCandidatesSeen();
    accumulator.skippedPrimarySatellites = spatialCandidates.skippedPrimarySatellites();
    Queue<ScreeningOutcome> outcomes = new ConcurrentLinkedQueue<>();
    ScreeningExecutionStatistics executionStatistics = screeningExecutor.execute(
        spatialCandidates.satellites().stream()
            .map(candidate -> screeningTask(request, candidate, outcomes))
            .toList());
    accumulator.addOutcomes(outcomes);
    accumulator.candidates.sort(Comparator
        .comparingDouble((CatalogConjunctionCandidate candidate) ->
            candidate.conjunctionResult().closestApproach().missDistanceMeters())
        .thenComparingInt(candidate -> candidate.satellite().noradCatalogId()));

    return new CatalogConjunctionResult(
        request,
        primarySatellite,
        accumulator.candidates,
        accumulator.statistics(),
        executionStatistics);
  }

  private Runnable screeningTask(
      CatalogConjunctionRequest request,
      CatalogSatellite candidate,
      Queue<ScreeningOutcome> outcomes) {
    return () -> outcomes.add(new ScreeningOutcome(
        candidate,
        conjunctionService.analyze(conjunctionRequest(request, candidate))));
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

  private record ScreeningOutcome(
      CatalogSatellite candidate,
      ConjunctionResult conjunctionResult) {
  }

  private static final class ScreeningAccumulator {
    private final List<CatalogConjunctionCandidate> candidates = new ArrayList<>();
    private long catalogSatellitesSeen;
    private long skippedPrimarySatellites;
    private long analyzedCandidates;
    private long conjunctionCandidates;
    private long clearCandidates;

    private void addOutcomes(Collection<ScreeningOutcome> outcomes) {
      for (ScreeningOutcome outcome : outcomes) {
        analyzedCandidates++;
        if (outcome.conjunctionResult().status() == ConjunctionStatus.CONJUNCTION) {
          conjunctionCandidates++;
          candidates.add(new CatalogConjunctionCandidate(outcome.candidate(), outcome.conjunctionResult()));
        } else {
          clearCandidates++;
        }
      }
    }

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
