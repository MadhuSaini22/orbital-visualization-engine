package com.orbitvisualizationengine.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.orbitvisualizationengine.server.domain.OrbitElementRecord;
import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import com.orbitvisualizationengine.server.dto.SatelliteListResponse;
import com.orbitvisualizationengine.server.ingestion.CelesTrakClient;
import com.orbitvisualizationengine.server.repository.SatelliteRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
  private static final Map<String, String> GROUPS = Map.of(
      "STATIONS", "Space Stations",
      "ACTIVE", "Active Satellites",
      "WEATHER", "Weather",
      "GEO", "Geosynchronous",
      "SCIENCE", "Science");

  private final CelesTrakClient celesTrak;
  private final SatelliteRepository satellites;

  public CatalogService(CelesTrakClient celesTrak, SatelliteRepository satellites) {
    this.celesTrak = celesTrak;
    this.satellites = satellites;
  }

  public Map<String, String> groups() {
    return GROUPS;
  }

  public SatelliteListResponse loadGroup(String group) {
    JsonNode records = celesTrak.fetchGroupJson(group);
    Instant now = Instant.now();
    if (records != null && records.isArray()) {
      for (JsonNode record : records) {
        int noradId = record.path("NORAD_CAT_ID").asInt();
        if (noradId == 0) {
          continue;
        }
        String name = record.path("OBJECT_NAME").asText("UNKNOWN");
        satellites.upsertSatellite(new SatelliteRecord(noradId, name, record.path("OBJECT_TYPE").asText(null), null, "celestrak", now));
        satellites.upsertOrbitElement(new OrbitElementRecord(
            "celestrak-omm-" + noradId + "-" + record.path("EPOCH").asText("unknown"),
            noradId,
            "OMM_JSON",
            parseInstant(record.path("EPOCH").asText(null)),
            record.toString(),
            now));
      }
    }
    return new SatelliteListResponse("celestrak", now, satellites.findAll(500));
  }

  public String loadGroupTle(String group, int limit) {
    int cappedLimit = Math.max(1, Math.min(limit, 15));
    String rawTle = celesTrak.fetchGroupTle(group);
    String limitedTle = limitTleEntries(rawTle, cappedLimit);

    if (limitedTle.isBlank()) {
      throw new IllegalStateException("CelesTrak did not return TLE data for group " + group);
    }

    return limitedTle;
  }

  public SatelliteRecord getSatellite(int noradId) {
    return satellites.findByNoradId(noradId)
        .orElseThrow(() -> new IllegalArgumentException("Satellite " + noradId + " is not in the local catalog yet"));
  }

  public List<SatelliteRecord> localSatellites() {
    return localSatellites(500);
  }

  public List<SatelliteRecord> localSatellites(int limit) {
    return satellites.findAll(limit);
  }

  private Instant parseInstant(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return Instant.parse(value.endsWith("Z") ? value : value + "Z");
  }

  private String limitTleEntries(String rawTle, int limit) {
    if (rawTle == null || rawTle.isBlank()) {
      return "";
    }

    List<String> lines = new ArrayList<>();
    for (String line : rawTle.split("\\R")) {
      if (!line.isBlank()) {
        lines.add(line.trim());
      }
    }

    List<String> output = new ArrayList<>();
    int count = 0;
    for (int index = 0; index < lines.size() && count < limit;) {
      String current = lines.get(index);

      if (!current.startsWith("1 ")
          && index + 2 < lines.size()
          && lines.get(index + 1).startsWith("1 ")
          && lines.get(index + 2).startsWith("2 ")) {
        output.add(current);
        output.add(lines.get(index + 1));
        output.add(lines.get(index + 2));
        count++;
        index += 3;
        continue;
      }

      if (current.startsWith("1 ")
          && index + 1 < lines.size()
          && lines.get(index + 1).startsWith("2 ")) {
        output.add("OBJECT " + current.substring(2, Math.min(current.length(), 7)).trim());
        output.add(current);
        output.add(lines.get(index + 1));
        count++;
        index += 2;
        continue;
      }

      index++;
    }

    return String.join(System.lineSeparator(), output);
  }
}
