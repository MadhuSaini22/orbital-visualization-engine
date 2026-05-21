package com.orbitvisualizationengine.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.domain.OrbitElementRecord;
import com.orbitvisualizationengine.server.domain.SatelliteRecord;
import com.orbitvisualizationengine.server.dto.SatelliteListResponse;
import com.orbitvisualizationengine.server.ingestion.CelesTrakClient;
import com.orbitvisualizationengine.server.repository.SatelliteRepository;
import com.orbitvisualizationengine.server.repository.SatelliteRepository.CatalogTleRecord;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

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
  private final ObjectMapper mapper;

  public CatalogService(CelesTrakClient celesTrak, SatelliteRepository satellites, ObjectMapper mapper) {
    this.celesTrak = celesTrak;
    this.satellites = satellites;
    this.mapper = mapper;
  }

  public Map<String, String> groups() {
    return GROUPS;
  }

  public SatelliteListResponse loadGroup(String group) {
    String groupId = normalizeGroup(group);
    Instant now = Instant.now();

    try {
      JsonNode records = celesTrak.fetchGroupJson(groupId);
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
          satellites.upsertCatalogMembership(groupId, noradId, now);
        }
      }
    } catch (RestClientResponseException exception) {
      if (satellites.findByGroup(groupId, 1).isEmpty()) {
        throw exception;
      }
    }
    return new SatelliteListResponse("database", now, satellites.findByGroup(groupId, 500));
  }

  public String loadGroupTle(String group, int limit) {
    int cappedLimit = Math.max(1, Math.min(limit, 15));
    String groupId = normalizeGroup(group);

    try {
      refreshGroupTle(groupId);
    } catch (RestClientResponseException exception) {
      String cachedTle = loadGroupTleFromDatabase(groupId, cappedLimit);
      if (!cachedTle.isBlank()) {
        return cachedTle;
      }
      throw exception;
    }

    String limitedTle = loadGroupTleFromDatabase(groupId, cappedLimit);

    if (limitedTle.isBlank()) {
      throw new IllegalStateException("No cached TLE data is available for group " + groupId);
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

  private void refreshGroupTle(String groupId) {
    String rawTle = celesTrak.fetchGroupTle(groupId);
    List<TleEntry> entries = parseTleEntries(rawTle);
    if (entries.isEmpty()) {
      throw new IllegalStateException("CelesTrak did not return TLE data for group " + groupId);
    }

    Instant now = Instant.now();
    for (TleEntry entry : entries) {
      satellites.upsertSatellite(new SatelliteRecord(entry.noradId(), entry.name(), "payload", null, "celestrak", now));
      satellites.upsertOrbitElement(new OrbitElementRecord(
          "celestrak-tle-" + entry.noradId(),
          entry.noradId(),
          "TLE",
          parseTleEpoch(entry.line1()),
          writeTlePayload(entry, groupId),
          now));
      satellites.upsertCatalogMembership(groupId, entry.noradId(), now);
    }
  }

  private String loadGroupTleFromDatabase(String groupId, int limit) {
    List<String> output = new ArrayList<>();
    for (CatalogTleRecord record : satellites.findLatestTlesByGroup(groupId, limit)) {
      try {
        JsonNode payload = mapper.readTree(record.rawPayload());
        String name = payload.path("name").asText(record.name());
        String line1 = payload.path("line1").asText("");
        String line2 = payload.path("line2").asText("");
        if (!line1.isBlank() && !line2.isBlank()) {
          output.add(name.isBlank() ? record.name() : name);
          output.add(line1);
          output.add(line2);
        }
      } catch (Exception ignored) {
        // Skip malformed cached payloads and continue serving valid catalog entries.
      }
    }
    return String.join(System.lineSeparator(), output);
  }

  private String writeTlePayload(TleEntry entry, String groupId) {
    try {
      return mapper.createObjectNode()
          .put("name", entry.name())
          .put("line1", entry.line1())
          .put("line2", entry.line2())
          .put("group", groupId)
          .toString();
    } catch (RuntimeException exception) {
      throw new IllegalStateException("Unable to serialize TLE payload for NORAD " + entry.noradId(), exception);
    }
  }

  private String normalizeGroup(String group) {
    if (group == null || group.isBlank()) {
      return "STATIONS";
    }
    return group.trim().toUpperCase(Locale.ROOT);
  }

  private List<TleEntry> parseTleEntries(String rawTle) {
    if (rawTle == null || rawTle.isBlank()) {
      return List.of();
    }

    List<String> lines = new ArrayList<>();
    for (String line : rawTle.split("\\R")) {
      if (!line.isBlank()) {
        lines.add(line.trim());
      }
    }

    List<TleEntry> output = new ArrayList<>();
    for (int index = 0; index < lines.size();) {
      String current = lines.get(index);

      if (!current.startsWith("1 ")
          && index + 2 < lines.size()
          && lines.get(index + 1).startsWith("1 ")
          && lines.get(index + 2).startsWith("2 ")) {
        addTleEntry(output, current, lines.get(index + 1), lines.get(index + 2));
        index += 3;
        continue;
      }

      if (current.startsWith("1 ")
          && index + 1 < lines.size()
          && lines.get(index + 1).startsWith("2 ")) {
        addTleEntry(output, "OBJECT " + current.substring(2, Math.min(current.length(), 7)).trim(), current, lines.get(index + 1));
        index += 2;
        continue;
      }

      index++;
    }

    return output;
  }

  private void addTleEntry(List<TleEntry> output, String name, String line1, String line2) {
    String noradIdText = line1.substring(2, Math.min(line1.length(), 7)).trim();
    if (noradIdText.isBlank()) {
      return;
    }
    output.add(new TleEntry(Integer.parseInt(noradIdText), name, line1, line2));
  }

  private Instant parseTleEpoch(String line1) {
    if (line1 == null || line1.length() < 32) {
      return null;
    }

    try {
      int twoDigitYear = Integer.parseInt(line1.substring(18, 20));
      double dayOfYear = Double.parseDouble(line1.substring(20, 32));
      int year = twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
      long wholeDays = (long) Math.floor(dayOfYear);
      double fractionalDay = dayOfYear - wholeDays;
      long seconds = Math.round(fractionalDay * 86400.0);
      return LocalDate.of(year, 1, 1)
          .plusDays(Math.max(0, wholeDays - 1))
          .atStartOfDay()
          .plusSeconds(seconds)
          .toInstant(ZoneOffset.UTC);
    } catch (RuntimeException exception) {
      return null;
    }
  }

  private record TleEntry(int noradId, String name, String line1, String line2) {
  }
}
