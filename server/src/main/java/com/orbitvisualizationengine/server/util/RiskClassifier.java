package com.orbitvisualizationengine.server.util;

import com.orbitvisualizationengine.server.domain.RiskLevel;
import org.springframework.stereotype.Component;

@Component
public class RiskClassifier {
  public RiskLevel classify(Double missDistanceKm, Double probabilityOfCollision) {
    if (probabilityOfCollision != null) {
      if (probabilityOfCollision >= 1e-4) {
        return RiskLevel.CRITICAL;
      }
      if (probabilityOfCollision >= 1e-6) {
        return RiskLevel.WARNING;
      }
    }

    if (missDistanceKm == null) {
      return RiskLevel.WATCH;
    }
    if (missDistanceKm < 1.0) {
      return RiskLevel.CRITICAL;
    }
    if (missDistanceKm < 10.0) {
      return RiskLevel.WARNING;
    }
    if (missDistanceKm < 25.0) {
      return RiskLevel.WATCH;
    }
    return RiskLevel.SAFE;
  }
}
