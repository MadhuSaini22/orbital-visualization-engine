package com.orbitvisualizationengine.server.catalog.ingestion;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class CatalogDiffer {
  public CatalogDiff diff(List<NormalizedCatalogRecord> incoming, List<CurrentCatalogRecord> current) {
    Map<Integer, CurrentCatalogRecord> currentByNorad = current.stream()
        .collect(Collectors.toMap(CurrentCatalogRecord::noradCatalogId, Function.identity()));
    Set<Integer> incomingNoradIds = incoming.stream()
        .map(NormalizedCatalogRecord::noradCatalogId)
        .collect(Collectors.toSet());

    List<NormalizedCatalogRecord> added = new ArrayList<>();
    List<NormalizedCatalogRecord> changed = new ArrayList<>();
    List<NormalizedCatalogRecord> unchanged = new ArrayList<>();

    for (NormalizedCatalogRecord record : incoming) {
      CurrentCatalogRecord currentRecord = currentByNorad.get(record.noradCatalogId());
      if (currentRecord == null) {
        added.add(record);
      } else if (!record.tleSha256().equals(currentRecord.tleSha256())) {
        changed.add(record);
      } else {
        unchanged.add(record);
      }
    }

    List<CurrentCatalogRecord> removed = current.stream()
        .filter(record -> !incomingNoradIds.contains(record.noradCatalogId()))
        .toList();

    return new CatalogDiff(List.copyOf(added), List.copyOf(changed), List.copyOf(unchanged), removed);
  }

}
