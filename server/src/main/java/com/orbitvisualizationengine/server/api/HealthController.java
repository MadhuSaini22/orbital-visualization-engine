package com.orbitvisualizationengine.server.api;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  @GetMapping("/health")
  Map<String, Object> health() {
    return Map.of("status", "ok", "time", Instant.now().toString(), "service", "orbit-analysis-server");
  }
}
