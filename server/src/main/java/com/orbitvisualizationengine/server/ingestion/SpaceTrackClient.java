package com.orbitvisualizationengine.server.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.orbitvisualizationengine.server.config.AppProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Component
public class SpaceTrackClient {
  private final AppProperties properties;
  private final RestClient restClient;

  public SpaceTrackClient(AppProperties properties) {
    this.properties = properties;
    this.restClient = RestClient.builder().baseUrl(properties.spaceTrackBaseUrl()).build();
  }

  public JsonNode fetchPublicCdms() {
    if (properties.spaceTrackUsername().isBlank() || properties.spaceTrackPassword().isBlank()) {
      throw new IllegalStateException("Space-Track credentials are not configured");
    }

    LinkedMultiValueMap<String, String> credentials = new LinkedMultiValueMap<>();
    credentials.add("identity", properties.spaceTrackUsername());
    credentials.add("password", properties.spaceTrackPassword());

    String cookie = restClient.post()
        .uri("/ajaxauth/login")
        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .body(credentials)
        .retrieve()
        .toBodilessEntity()
        .getHeaders()
        .getFirst("Set-Cookie");

    return restClient.get()
        .uri("/basicspacedata/query/class/cdm_public/format/json")
        .header("Cookie", cookie == null ? "" : cookie)
        .retrieve()
        .body(JsonNode.class);
  }
}
