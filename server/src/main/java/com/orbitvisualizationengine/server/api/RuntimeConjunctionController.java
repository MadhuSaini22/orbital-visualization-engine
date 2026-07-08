package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionEngine;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/conjunctions")
public class RuntimeConjunctionController {
  private final ConjunctionService conjunctionService;
  private final RelativeMotionService relativeMotionService;
  private final ConjunctionEngine conjunctionEngine;
  private final RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport;

  public RuntimeConjunctionController(
      ConjunctionService conjunctionService,
      RelativeMotionService relativeMotionService,
      ConjunctionEngine conjunctionEngine,
      RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport) {
    this.conjunctionService = conjunctionService;
    this.relativeMotionService = relativeMotionService;
    this.conjunctionEngine = conjunctionEngine;
    this.runtimeOrbitAnalysisSupport = runtimeOrbitAnalysisSupport;
  }

  @PostMapping("/pairwise")
  ConjunctionResult analyze(@Valid @RequestBody ConjunctionRequest request) {
    return conjunctionService.analyze(request);
  }

  @PostMapping("/pairwise/orbit")
  ConjunctionResult analyzeOrbit(@Valid @RequestBody RuntimeOrbitConjunctionRequest request) {
    ConjunctionRequest delegate = new ConjunctionRequest(
        runtimeOrbitAnalysisSupport.stableObjectId(request.primaryObject()),
        runtimeOrbitAnalysisSupport.stableObjectId(request.secondaryObject()),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.relativeFrame(),
        request.missDistanceThresholdMeters());
    RelativeMotionResult relativeMotion = relativeMotionService.computeRelativeMotion(
        new RelativeMotionRequest(
            delegate.primaryNoradCatalogId(),
            delegate.secondaryNoradCatalogId(),
            delegate.startTime(),
            delegate.stopTime(),
            delegate.step(),
            delegate.relativeFrame()),
        runtimeOrbitAnalysisSupport.propagate(
            request.primaryObject(),
            request.startTime(),
            request.stopTime(),
            request.step(),
            request.propagatorType()),
        runtimeOrbitAnalysisSupport.propagate(
            request.secondaryObject(),
            request.startTime(),
            request.stopTime(),
            request.step(),
            request.propagatorType()));
    return conjunctionEngine.analyze(delegate, relativeMotion);
  }
}
