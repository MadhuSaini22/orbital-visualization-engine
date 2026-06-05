package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.config.CapabilityRegistry;
import com.orbitvisualizationengine.server.dto.CapabilityRegistryResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/capabilities")
public class CapabilityController {
  private final CapabilityRegistry capabilities;

  public CapabilityController(CapabilityRegistry capabilities) {
    this.capabilities = capabilities;
  }

  @GetMapping
  CapabilityRegistryResponse get() {
    return capabilities.response();
  }
}
