package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionCandidate;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogScreeningStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.ScreeningExecutionStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/conjunctions")
public class CatalogScreeningController {
  private final CatalogConjunctionService catalogConjunctionService;
  private final CatalogService catalogService;
  private final RelativeMotionService relativeMotionService;
  private final ConjunctionEngine conjunctionEngine;
  private final RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport;

  public CatalogScreeningController(
      CatalogConjunctionService catalogConjunctionService,
      CatalogService catalogService,
      RelativeMotionService relativeMotionService,
      ConjunctionEngine conjunctionEngine,
      RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport) {
    this.catalogConjunctionService = catalogConjunctionService;
    this.catalogService = catalogService;
    this.relativeMotionService = relativeMotionService;
    this.conjunctionEngine = conjunctionEngine;
    this.runtimeOrbitAnalysisSupport = runtimeOrbitAnalysisSupport;
  }

  @PostMapping("/catalog-screening")
  CatalogConjunctionResult screen(@Valid @RequestBody CatalogConjunctionRequest request) {
    return catalogConjunctionService.screen(request);
  }

  @PostMapping("/catalog-screening/orbit")
  RuntimeOrbitCatalogScreeningResult screenOrbit(
      @Valid @RequestBody RuntimeOrbitCatalogScreeningRequest request) {
    int primaryObjectId = runtimeOrbitAnalysisSupport.stableObjectId(request.primaryObject());
    PropagationResult primaryPropagation = runtimeOrbitAnalysisSupport.propagate(
        request.primaryObject(),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.propagatorType());
    List<CatalogSatellite> catalogSatellites = catalogService.findAll();
    List<CatalogConjunctionCandidate> candidates = new ArrayList<>();
    long skippedPrimarySatellites = 0;
    long conjunctionCandidates = 0;
    long clearCandidates = 0;

    for (CatalogSatellite candidate : catalogSatellites) {
      if (request.primaryObject().type() == RuntimeObjectType.CATALOG_NORAD
          && candidate.noradCatalogId() == request.primaryObject().noradCatalogId()) {
        skippedPrimarySatellites++;
        continue;
      }
      RuntimeObjectRef candidateObject = new RuntimeObjectRef(
          RuntimeObjectType.CATALOG_NORAD,
          candidate.noradCatalogId(),
          null,
          null);
      ConjunctionRequest conjunctionRequest = new ConjunctionRequest(
          primaryObjectId,
          candidate.noradCatalogId(),
          request.startTime(),
          request.stopTime(),
          request.step(),
          request.relativeFrame(),
          request.missDistanceThresholdMeters());
      PropagationResult candidatePropagation = runtimeOrbitAnalysisSupport.propagate(
          candidateObject,
          request.startTime(),
          request.stopTime(),
          request.step(),
          request.propagatorType());
      RelativeMotionResult relativeMotion = relativeMotionService.computeRelativeMotion(
          new RelativeMotionRequest(
              conjunctionRequest.primaryNoradCatalogId(),
              conjunctionRequest.secondaryNoradCatalogId(),
              conjunctionRequest.startTime(),
              conjunctionRequest.stopTime(),
              conjunctionRequest.step(),
              conjunctionRequest.relativeFrame()),
          primaryPropagation,
          candidatePropagation);
      ConjunctionResult conjunctionResult = conjunctionEngine.analyze(conjunctionRequest, relativeMotion);
      if (conjunctionResult.status() == ConjunctionStatus.CONJUNCTION) {
        conjunctionCandidates++;
        candidates.add(new CatalogConjunctionCandidate(candidate, conjunctionResult));
      } else {
        clearCandidates++;
      }
    }

    candidates.sort(Comparator
        .comparingDouble((CatalogConjunctionCandidate candidate) ->
            candidate.conjunctionResult().closestApproach().missDistanceMeters())
        .thenComparingInt(candidate -> candidate.satellite().noradCatalogId()));
    long analyzedCandidates = conjunctionCandidates + clearCandidates;
    CatalogScreeningStatistics statistics = new CatalogScreeningStatistics(
        catalogSatellites.size(),
        skippedPrimarySatellites,
        analyzedCandidates,
        conjunctionCandidates,
        clearCandidates);
    ScreeningExecutionStatistics executionStatistics = new ScreeningExecutionStatistics(
        analyzedCandidates,
        analyzedCandidates,
        0);
    return new RuntimeOrbitCatalogScreeningResult(
        request,
        request.primaryObject(),
        candidates,
        statistics,
        executionStatistics);
  }
}
