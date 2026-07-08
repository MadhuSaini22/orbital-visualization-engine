package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceState;
import java.util.List;

public record RuntimeOrbitCovariancePropagationResponse(
    RuntimeOrbitCovariancePropagationRequest request,
    RuntimeObjectRef primaryObject,
    List<CovarianceState> states) {
}
