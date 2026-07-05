package com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.spatial;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

@Component
public class DefaultSpatialIndexBuilder implements SpatialIndexBuilder {
  private static final BigDecimal INCLINATION_BIN_DEGREES = BigDecimal.TEN;
  private static final BigDecimal RAAN_BIN_DEGREES = BigDecimal.valueOf(15);
  private static final BigDecimal MEAN_MOTION_BIN_REV_PER_DAY = BigDecimal.ONE;
  private static final int RAAN_BIN_COUNT = 24;
  private static final int NEIGHBOR_BIN_RADIUS = 1;

  @Override
  public SpatialIndex build(Stream<CatalogSatellite> satellites) {
    if (satellites == null) {
      throw new IllegalArgumentException("Catalog satellite stream is required");
    }

    Map<BinKey, List<CatalogSatellite>> bins = new HashMap<>();
    List<CatalogSatellite> fallback = new ArrayList<>();
    satellites.forEach(satellite -> addSatellite(satellite, bins, fallback));
    return new UniformGridSpatialIndex(bins, fallback);
  }

  private static void addSatellite(
      CatalogSatellite satellite,
      Map<BinKey, List<CatalogSatellite>> bins,
      List<CatalogSatellite> fallback) {
    if (satellite == null) {
      return;
    }

    BinKey key = binKey(satellite);
    if (key == null) {
      fallback.add(satellite);
      return;
    }
    bins.computeIfAbsent(key, ignored -> new ArrayList<>()).add(satellite);
  }

  private static BinKey binKey(CatalogSatellite satellite) {
    Integer inclinationBin = bin(satellite.inclinationDeg(), INCLINATION_BIN_DEGREES);
    Integer raanBin = raanBin(satellite.raanDeg());
    Integer meanMotionBin = bin(satellite.meanMotionRevPerDay(), MEAN_MOTION_BIN_REV_PER_DAY);
    if (inclinationBin == null || raanBin == null || meanMotionBin == null) {
      return null;
    }
    return new BinKey(inclinationBin, raanBin, meanMotionBin);
  }

  private static Integer raanBin(BigDecimal value) {
    Integer bin = bin(value, RAAN_BIN_DEGREES);
    if (bin == null) {
      return null;
    }
    return Math.floorMod(bin, RAAN_BIN_COUNT);
  }

  private static Integer bin(BigDecimal value, BigDecimal binSize) {
    if (value == null) {
      return null;
    }
    return value.divide(binSize, 0, RoundingMode.FLOOR).intValue();
  }

  private record BinKey(int inclinationBin, int raanBin, int meanMotionBin) {
  }

  private static final class UniformGridSpatialIndex implements SpatialIndex {
    private final Map<BinKey, List<CatalogSatellite>> bins;
    private final List<CatalogSatellite> fallback;

    private UniformGridSpatialIndex(
        Map<BinKey, List<CatalogSatellite>> bins,
        List<CatalogSatellite> fallback) {
      this.bins = copyBins(bins);
      this.fallback = List.copyOf(fallback);
    }

    @Override
    public SpatialCandidateResult query(SpatialIndexQuery query) {
      if (query == null) {
        throw new IllegalArgumentException("Spatial index query is required");
      }

      CatalogSatellite primary = query.primarySatellite();
      Map<Integer, CatalogSatellite> candidatesByNorad = new LinkedHashMap<>();
      addCandidates(fallback, primary, candidatesByNorad);

      BinKey primaryKey = binKey(primary);
      if (primaryKey == null) {
        addCandidates(bins.values().stream().flatMap(List::stream).toList(), primary, candidatesByNorad);
      } else {
        for (BinKey nearbyKey : nearbyKeys(primaryKey)) {
          addCandidates(bins.getOrDefault(nearbyKey, List.of()), primary, candidatesByNorad);
        }
      }

      List<SpatialCandidate> candidates = candidatesByNorad.values().stream()
          .map(SpatialCandidate::new)
          .toList();
      long skippedPrimary = containsPrimary(primary) ? 1 : 0;
      return new SpatialCandidateResult(candidates, candidates.size() + skippedPrimary, skippedPrimary);
    }

    private boolean containsPrimary(CatalogSatellite primary) {
      return containsPrimary(fallback, primary)
          || bins.values().stream().anyMatch(satellites -> containsPrimary(satellites, primary));
    }

    private static boolean containsPrimary(List<CatalogSatellite> satellites, CatalogSatellite primary) {
      return satellites.stream()
          .anyMatch(satellite -> satellite.noradCatalogId() == primary.noradCatalogId());
    }

    private static void addCandidates(
        List<CatalogSatellite> satellites,
        CatalogSatellite primary,
        Map<Integer, CatalogSatellite> candidatesByNorad) {
      for (CatalogSatellite satellite : satellites) {
        if (satellite.noradCatalogId() != primary.noradCatalogId()) {
          candidatesByNorad.putIfAbsent(satellite.noradCatalogId(), satellite);
        }
      }
    }

    private static List<BinKey> nearbyKeys(BinKey key) {
      Set<BinKey> keys = new LinkedHashSet<>();
      for (int inclinationOffset = -NEIGHBOR_BIN_RADIUS;
          inclinationOffset <= NEIGHBOR_BIN_RADIUS;
          inclinationOffset++) {
        for (int raanOffset = -NEIGHBOR_BIN_RADIUS; raanOffset <= NEIGHBOR_BIN_RADIUS; raanOffset++) {
          for (int meanMotionOffset = -NEIGHBOR_BIN_RADIUS;
              meanMotionOffset <= NEIGHBOR_BIN_RADIUS;
              meanMotionOffset++) {
            keys.add(new BinKey(
                key.inclinationBin() + inclinationOffset,
                Math.floorMod(key.raanBin() + raanOffset, RAAN_BIN_COUNT),
                key.meanMotionBin() + meanMotionOffset));
          }
        }
      }
      return List.copyOf(keys);
    }

    private static Map<BinKey, List<CatalogSatellite>> copyBins(Map<BinKey, List<CatalogSatellite>> source) {
      Map<BinKey, List<CatalogSatellite>> copy = new HashMap<>();
      source.forEach((key, satellites) -> copy.put(key, List.copyOf(satellites)));
      return Map.copyOf(copy);
    }
  }
}
