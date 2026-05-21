package com.orbitvisualizationengine.server.jobs;

import com.orbitvisualizationengine.server.service.CatalogService;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class CatalogRefreshJob {
  private final CatalogService catalogService;

  public CatalogRefreshJob(CatalogService catalogService) {
    this.catalogService = catalogService;
  }

  public void refreshDefaultGroups() {
    for (String group : List.of("STATIONS", "ACTIVE")) {
      catalogService.loadGroup(group);
    }
  }
}
