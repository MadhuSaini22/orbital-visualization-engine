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

  public RelativeMotionController(RelativeMotionService relativeMotionService) {
    this.relativeMotionService = relativeMotionService;
  }

  @PostMapping
  RelativeMotionResult compute(@Valid @RequestBody RelativeMotionRequest request) {
    return relativeMotionService.computeRelativeMotion(request);
  }
}
