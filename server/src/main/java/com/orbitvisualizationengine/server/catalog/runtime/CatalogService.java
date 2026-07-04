package com.orbitvisualizationengine.server.catalog.runtime;

import com.orbitvisualizationengine.server.catalog.runtime.exception.CatalogSatelliteNotFoundException;
import com.orbitvisualizationengine.server.catalog.runtime.mapper.CatalogSatelliteMapper;
import com.orbitvisualizationengine.server.catalog.runtime.repository.CatalogRepository;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
  private final CatalogRepository repository;
  private final CatalogSatelliteMapper mapper;

  public CatalogService(CatalogRepository repository, CatalogSatelliteMapper mapper) {
    this.repository = repository;
    this.mapper = mapper;
  }

  public CatalogSatellite findByNoradId(int noradCatalogId) {
    validateNoradCatalogId(noradCatalogId);
    return repository.findByNoradId(noradCatalogId)
        .map(mapper::toSatellite)
        .orElseThrow(() -> new CatalogSatelliteNotFoundException(noradCatalogId));
  }

  public List<CatalogSatellite> findAll() {
    return repository.findAll().stream()
        .map(mapper::toSatellite)
        .toList();
  }

  public List<CatalogSatellite> findByName(String nameQuery) {
    String query = validateNameQuery(nameQuery);
    return repository.findByName(query).stream()
        .map(mapper::toSatellite)
        .toList();
  }

  public boolean exists(int noradCatalogId) {
    validateNoradCatalogId(noradCatalogId);
    return repository.exists(noradCatalogId);
  }

  public long count() {
    return repository.count();
  }

  public Stream<CatalogSatellite> stream() {
    return repository.stream().map(mapper::toSatellite);
  }

  private void validateNoradCatalogId(int noradCatalogId) {
    if (noradCatalogId <= 0) {
      throw new IllegalArgumentException("NORAD catalog id must be positive");
    }
  }

  private String validateNameQuery(String nameQuery) {
    if (nameQuery == null || nameQuery.isBlank()) {
      throw new IllegalArgumentException("Satellite name query must not be blank");
    }
    return nameQuery.trim();
  }
}
