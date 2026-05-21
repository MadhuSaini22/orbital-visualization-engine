package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import com.orbitvisualizationengine.server.dto.SatelliteListResponse;
import com.orbitvisualizationengine.server.service.CatalogService;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
  private final CatalogService catalogService;

  public CatalogController(CatalogService catalogService) {
    this.catalogService = catalogService;
  }

  @GetMapping("/groups")
  Map<String, String> groups() {
    return catalogService.groups();
  }

  @GetMapping("/satellites")
  SatelliteListResponse satellites(@RequestParam(required = false) String group) {
    if (group == null || group.isBlank()) {
      return new SatelliteListResponse("database", Instant.now(), catalogService.localSatellites(250));
    }
    return catalogService.loadGroup(group);
  }

  @GetMapping(value = "/tle", produces = MediaType.TEXT_PLAIN_VALUE)
  String tle(@RequestParam(defaultValue = "STATIONS") String group,
      @RequestParam(defaultValue = "15") int limit) {
    return catalogService.loadGroupTle(group, limit);
  }

  @GetMapping("/satellites/{noradId}")
  SatelliteRecord satellite(@PathVariable int noradId) {
    return catalogService.getSatellite(noradId);
  }
}
