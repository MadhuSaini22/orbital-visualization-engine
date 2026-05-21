package com.orbitvisualizationengine.server.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.config.AppProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class CelesTrakClient {
  private final RestClient restClient;
  private final ObjectMapper mapper;

  public CelesTrakClient(AppProperties properties, ObjectMapper mapper) {
    this.restClient = RestClient.builder().baseUrl(properties.celestrakBaseUrl()).build();
    this.mapper = mapper;
  }

  public JsonNode fetchGroupJson(String group) {
    return restClient.get()
        .uri("/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON", celesTrakGroup(group))
        .accept(MediaType.APPLICATION_JSON)
        .header("User-Agent", "orbit-visualization-engine/0.1")
        .retrieve()
        .body(JsonNode.class);
  }

  public String fetchGroupTle(String group) {
    String celesTrakGroup = celesTrakGroup(group);
    try {
      return restClient.get()
          .uri("/NORAD/elements/gp.php?GROUP={group}&FORMAT=TLE", celesTrakGroup)
          .accept(MediaType.TEXT_PLAIN)
          .header("User-Agent", "orbit-visualization-engine/0.1")
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException exception) {
      if (exception.getStatusCode().value() != 403) {
        throw exception;
      }
      return fetchLegacyGroupTle(celesTrakGroup);
    }
  }

  public TleText fetchTleByNoradId(int noradId) {
    String text = restClient.get()
        .uri("/NORAD/elements/gp.php?CATNR={noradId}&FORMAT=TLE", noradId)
        .accept(MediaType.TEXT_PLAIN)
        .header("User-Agent", "orbit-visualization-engine/0.1")
        .retrieve()
        .body(String.class);

    List<String> lines = new ArrayList<>();
    for (String line : text.split("\\R")) {
      if (!line.isBlank()) {
        lines.add(line.trim());
      }
    }
    if (lines.size() < 3) {
      throw new IllegalStateException("CelesTrak did not return a complete TLE for NORAD " + noradId);
    }
    JsonNode payload = mapper.createObjectNode()
        .put("name", lines.get(0))
        .put("line1", lines.get(1))
        .put("line2", lines.get(2));
    return new TleText(lines.get(0), lines.get(1), lines.get(2), payload.toString());
  }

  public record TleText(String name, String line1, String line2, String rawPayload) {
  }

  private String celesTrakGroup(String group) {
    if (group == null || group.isBlank()) {
      return "stations";
    }

    return group.trim().toLowerCase(Locale.ROOT);
  }

  private String fetchLegacyGroupTle(String group) {
    return restClient.get()
        .uri("/NORAD/elements/{group}.txt", group)
        .accept(MediaType.TEXT_PLAIN)
        .header("User-Agent", "orbit-visualization-engine/0.1")
        .retrieve()
        .body(String.class);
  }
}
