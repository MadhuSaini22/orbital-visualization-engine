package com.orbitvisualizationengine.server;

import com.orbitvisualizationengine.server.config.AppProperties;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({AppProperties.class, CatalogProviderProperties.class})
public class OrbitAnalysisServerApplication {
  public static void main(String[] args) {
    SpringApplication.run(OrbitAnalysisServerApplication.class, args);
  }
}
