package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.ConjunctionRecord;
import com.orbitvisualizationengine.server.domain.RiskLevel;
import com.orbitvisualizationengine.server.repository.ConjunctionRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ConjunctionService {
  private final ConjunctionRepository conjunctions;

  public ConjunctionService(ConjunctionRepository conjunctions) {
    this.conjunctions = conjunctions;
  }

  public List<ConjunctionRecord> search(Integer noradId, RiskLevel risk, Instant from, Instant to) {
    return search(noradId, null, risk, from, to);
  }

  public List<ConjunctionRecord> search(Integer noradId, List<Integer> noradIds, RiskLevel risk, Instant from, Instant to) {
    return conjunctions.search(noradId, noradIds, risk, from, to);
  }

  public ConjunctionRecord get(String id) {
    return conjunctions.findById(id).stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Conjunction record not found: " + id));
  }
}
