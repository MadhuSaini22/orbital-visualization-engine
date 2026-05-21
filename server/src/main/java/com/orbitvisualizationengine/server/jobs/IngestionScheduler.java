package com.orbitvisualizationengine.server.jobs;

import com.orbitvisualizationengine.server.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class IngestionScheduler {
  private static final Logger log = LoggerFactory.getLogger(IngestionScheduler.class);

  private final AppProperties properties;
  private final CatalogRefreshJob catalogRefreshJob;
  private final CdmRefreshJob cdmRefreshJob;

  public IngestionScheduler(AppProperties properties, CatalogRefreshJob catalogRefreshJob, CdmRefreshJob cdmRefreshJob) {
    this.properties = properties;
    this.catalogRefreshJob = catalogRefreshJob;
    this.cdmRefreshJob = cdmRefreshJob;
  }

  @Scheduled(fixedDelayString = "PT2H", initialDelayString = "PT30S")
  public void refreshCatalogs() {
    if (!properties.ingestionEnabled()) {
      return;
    }
    catalogRefreshJob.refreshDefaultGroups();
    log.info("Refreshed default satellite catalog groups");
  }

  @Scheduled(fixedDelayString = "PT4H", initialDelayString = "PT2M")
  public void refreshCdms() {
    if (!properties.ingestionEnabled()) {
      return;
    }
    int count = cdmRefreshJob.refreshPublicCdms();
    log.info("Refreshed {} public CDM records", count);
  }
}
