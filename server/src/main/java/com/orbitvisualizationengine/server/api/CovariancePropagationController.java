package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationRequest;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime/covariance")
public class CovariancePropagationController {
  private final CovariancePropagationService covariancePropagationService;

  public CovariancePropagationController(CovariancePropagationService covariancePropagationService) {
    this.covariancePropagationService = covariancePropagationService;
  }

  @PostMapping("/propagate")
  RuntimeCovariancePropagationResponse propagate(@Valid @RequestBody CovariancePropagationRequest request) {
    return RuntimeCovariancePropagationResponse.from(covariancePropagationService.propagate(request));
  }
}
