package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.domain.ConjunctionRecord;
import com.orbitvisualizationengine.server.domain.RiskLevel;
import com.orbitvisualizationengine.server.dto.ConjunctionListResponse;
import com.orbitvisualizationengine.server.jobs.CdmRefreshJob;
import com.orbitvisualizationengine.server.service.ConjunctionService;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/conjunctions")
public class ConjunctionController {
  private final ConjunctionService conjunctionService;
  private final CdmRefreshJob cdmRefreshJob;

  public ConjunctionController(ConjunctionService conjunctionService, CdmRefreshJob cdmRefreshJob) {
    this.conjunctionService = conjunctionService;
    this.cdmRefreshJob = cdmRefreshJob;
  }

  @GetMapping
  ConjunctionListResponse search(
      @RequestParam(required = false) Integer noradId,
      @RequestParam(required = false) List<Integer> noradIds,
      @RequestParam(required = false) RiskLevel risk,
      @RequestParam(required = false) Instant from,
      @RequestParam(required = false) Instant to) {
    return new ConjunctionListResponse(conjunctionService.search(noradId, noradIds, risk, from, to));
  }

  @GetMapping("/{id}")
  ConjunctionRecord get(@PathVariable String id) {
    return conjunctionService.get(id);
  }

  @PostMapping("/refresh")
  ConjunctionListResponse refresh() {
    cdmRefreshJob.refreshPublicCdms();
    return new ConjunctionListResponse(conjunctionService.search(null, null, null, null, null));
  }
}
