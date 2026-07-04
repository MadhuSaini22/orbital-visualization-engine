package com.orbitvisualizationengine.server.catalog.ingestion;

import com.orbitvisualizationengine.server.catalog.ingestion.repository.CatalogSourceRepository;
import com.orbitvisualizationengine.server.catalog.ingestion.repository.CatalogSyncRunRepository;
import com.orbitvisualizationengine.server.catalog.ingestion.repository.CatalogVersionRepository;
import com.orbitvisualizationengine.server.catalog.ingestion.repository.SatelliteCatalogHistoryRepository;
import com.orbitvisualizationengine.server.catalog.ingestion.repository.SatelliteCatalogRepository;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSourceDescriptor;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CatalogPersistenceService {
  private final CatalogSourceRepository sourceRepository;
  private final CatalogVersionRepository versionRepository;
  private final CatalogSyncRunRepository syncRunRepository;
  private final SatelliteCatalogRepository satelliteCatalogRepository;
  private final SatelliteCatalogHistoryRepository historyRepository;

  public CatalogPersistenceService(
      CatalogSourceRepository sourceRepository,
      CatalogVersionRepository versionRepository,
      CatalogSyncRunRepository syncRunRepository,
      SatelliteCatalogRepository satelliteCatalogRepository,
      SatelliteCatalogHistoryRepository historyRepository) {
    this.sourceRepository = sourceRepository;
    this.versionRepository = versionRepository;
    this.syncRunRepository = syncRunRepository;
    this.satelliteCatalogRepository = satelliteCatalogRepository;
    this.historyRepository = historyRepository;
  }

  public long ensureSource(CatalogSourceDescriptor source) {
    return sourceRepository.ensureSource(source);
  }

  public List<CurrentCatalogRecord> loadCurrentCatalog(long sourceId) {
    return satelliteCatalogRepository.loadCurrentCatalog(sourceId);
  }

  public long createVersion(
      long sourceId,
      List<NormalizedCatalogRecord> records,
      CatalogDiff diff,
      String catalogSha256) {
    Instant epochMin = records.stream().map(NormalizedCatalogRecord::epochAt).min(Instant::compareTo).orElse(null);
    Instant epochMax = records.stream().map(NormalizedCatalogRecord::epochAt).max(Instant::compareTo).orElse(null);

    return versionRepository.createImportingVersion(
        sourceId,
        epochMin,
        epochMax,
        records.size(),
        records.size(),
        diff.changedObjects() + diff.removed().size(),
        diff.added().size(),
        diff.removed().size(),
        catalogSha256);
  }

  public long createSyncRun(long versionId, long sourceId, int fetchedRecords) {
    return syncRunRepository.createRunningSyncRun(versionId, sourceId, fetchedRecords, fetchedRecords);
  }

  public void appendTleHistory(long versionId, long syncRunId, NormalizedCatalogRecord record) {
    long historyId = historyRepository.insertTleHistory(versionId, syncRunId, record);
    satelliteCatalogRepository.upsertProjection(versionId, historyId, record);
  }

  public void appendRemovedHistory(long versionId, long syncRunId, CurrentCatalogRecord record) {
    historyRepository.insertRemovedHistory(versionId, syncRunId, record.noradCatalogId());
    satelliteCatalogRepository.deleteProjection(record.noradCatalogId());
  }

  public void markUnchangedSeen(long versionId, List<NormalizedCatalogRecord> unchanged) {
    for (NormalizedCatalogRecord record : unchanged) {
      satelliteCatalogRepository.markSeen(versionId, record.noradCatalogId());
    }
  }

  public void publishVersion(long versionId) {
    versionRepository.publishVersion(versionId);
  }

  public void completeSyncRun(long syncRunId, CatalogDiff diff) {
    syncRunRepository.completeSucceededSyncRun(
        syncRunId,
        diff.added().size() + diff.changed().size() + diff.removed().size(),
        diff.added().size() + diff.changed().size(),
        diff.unchanged().size(),
        diff.removed().size());
  }
}
