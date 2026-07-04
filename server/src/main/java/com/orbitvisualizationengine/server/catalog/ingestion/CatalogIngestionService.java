package com.orbitvisualizationengine.server.catalog.ingestion;

import com.orbitvisualizationengine.server.catalog.provider.CatalogFetchRequest;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderRegistry;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderResponse;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSource;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderProperties;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderConfigurationException;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogIngestionService {
  private final CatalogProviderRegistry providerRegistry;
  private final CatalogProviderProperties providerProperties;
  private final CatalogNormalizer normalizer;
  private final CatalogValidator validator;
  private final CatalogHasher hasher;
  private final CatalogDiffer differ;
  private final CatalogPersistenceService persistence;

  public CatalogIngestionService(
      CatalogProviderRegistry providerRegistry,
      CatalogProviderProperties providerProperties,
      CatalogNormalizer normalizer,
      CatalogValidator validator,
      CatalogHasher hasher,
      CatalogDiffer differ,
      CatalogPersistenceService persistence) {
    this.providerRegistry = providerRegistry;
    this.providerProperties = providerProperties;
    this.normalizer = normalizer;
    this.validator = validator;
    this.hasher = hasher;
    this.differ = differ;
    this.persistence = persistence;
  }

  @Transactional
  public CatalogIngestionResult ingest(String providerCode) {
    CatalogSource source = providerRegistry.require(providerCode);
    CatalogFetchRequest request = ingestionRequest(providerCode);
    CatalogProviderResponse<?> response = source.fetch(request);

    List<NormalizedCatalogRecord> records = normalizer.normalize(response);
    validator.validate(records);
    String catalogSha256 = hasher.catalogSha256(records);

    long sourceId = persistence.ensureSource(source.descriptor());
    List<CurrentCatalogRecord> current = persistence.loadCurrentCatalog(sourceId);
    CatalogDiff diff = differ.diff(records, current);

    long versionId = persistence.createVersion(sourceId, records, diff, catalogSha256);
    long syncRunId = persistence.createSyncRun(versionId, sourceId, records.size());

    for (NormalizedCatalogRecord record : diff.added()) {
      persistence.appendTleHistory(versionId, syncRunId, record);
    }
    for (NormalizedCatalogRecord record : diff.changed()) {
      persistence.appendTleHistory(versionId, syncRunId, record);
    }
    for (CurrentCatalogRecord record : diff.removed()) {
      persistence.appendRemovedHistory(versionId, syncRunId, record);
    }
    persistence.markUnchangedSeen(versionId, diff.unchanged());
    persistence.completeSyncRun(syncRunId, diff);
    persistence.publishVersion(versionId);

    return new CatalogIngestionResult(
        versionId,
        syncRunId,
        records.size(),
        records.size(),
        diff.changedObjects() + diff.removed().size(),
        diff.added().size(),
        diff.removed().size(),
        catalogSha256);
  }

  private CatalogFetchRequest ingestionRequest(String providerCode) {
    CatalogProviderProperties.Provider provider = providerProperties.requiredProvider(providerCode);
    CatalogProviderProperties.Ingestion ingestion = provider.ingestion();
    if (ingestion == null) {
      throw new ProviderConfigurationException("Catalog provider " + providerCode + " has no ingestion request configured");
    }
    return new CatalogFetchRequest(
        ingestion.endpoint(),
        ingestion.expectedFormat(),
        ingestion.pathParameters(),
        ingestion.queryParameters());
  }
}
