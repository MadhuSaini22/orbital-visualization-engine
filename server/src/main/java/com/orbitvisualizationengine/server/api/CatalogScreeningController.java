package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/conjunctions")
public class CatalogScreeningController {
  private final CatalogConjunctionService catalogConjunctionService;

  public CatalogScreeningController(CatalogConjunctionService catalogConjunctionService) {
    this.catalogConjunctionService = catalogConjunctionService;
  }

  @PostMapping("/catalog-screening")
  CatalogConjunctionResult screen(@Valid @RequestBody CatalogConjunctionRequest request) {
    return catalogConjunctionService.screen(request);
  }
}
