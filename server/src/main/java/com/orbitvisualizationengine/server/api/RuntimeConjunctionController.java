package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/conjunctions")
public class RuntimeConjunctionController {
  private final ConjunctionService conjunctionService;

  public RuntimeConjunctionController(ConjunctionService conjunctionService) {
    this.conjunctionService = conjunctionService;
  }

  @PostMapping("/pairwise")
  ConjunctionResult analyze(@Valid @RequestBody ConjunctionRequest request) {
    return conjunctionService.analyze(request);
  }
}
