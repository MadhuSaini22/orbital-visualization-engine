package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/collision-probability")
public class CollisionProbabilityController {
  private final CollisionProbabilityService collisionProbabilityService;

  public CollisionProbabilityController(CollisionProbabilityService collisionProbabilityService) {
    this.collisionProbabilityService = collisionProbabilityService;
  }

  @PostMapping
  CollisionProbabilityResult compute(@Valid @RequestBody CollisionProbabilityRequest request) {
    return collisionProbabilityService.compute(request);
  }
}
