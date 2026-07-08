package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/relative-motion")
public class RelativeMotionController {
  private final RelativeMotionService relativeMotionService;
  private final RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport;

  public RelativeMotionController(
      RelativeMotionService relativeMotionService,
      RuntimeOrbitAnalysisSupport runtimeOrbitAnalysisSupport) {
    this.relativeMotionService = relativeMotionService;
    this.runtimeOrbitAnalysisSupport = runtimeOrbitAnalysisSupport;
  }

  @PostMapping
  RelativeMotionResult compute(@Valid @RequestBody RelativeMotionRequest request) {
    return relativeMotionService.computeRelativeMotion(request);
  }

  @PostMapping("/orbit")
  RelativeMotionResult computeOrbit(@Valid @RequestBody RuntimeOrbitRelativeMotionRequest request) {
    RelativeMotionRequest delegate = new RelativeMotionRequest(
        runtimeOrbitAnalysisSupport.stableObjectId(request.primaryObject()),
        runtimeOrbitAnalysisSupport.stableObjectId(request.secondaryObject()),
        request.startTime(),
        request.stopTime(),
        request.step(),
        request.frame());
    return relativeMotionService.computeRelativeMotion(
        delegate,
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
  }
}
