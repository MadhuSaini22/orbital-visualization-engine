package com.orbitvisualizationengine.server.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import com.orbitvisualizationengine.server.domain.ConjunctionRecord;
import com.orbitvisualizationengine.server.ingestion.SpaceTrackClient;
import com.orbitvisualizationengine.server.repository.ConjunctionRepository;
import com.orbitvisualizationengine.server.util.RiskClassifier;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.stereotype.Component;

@Component
public class CdmRefreshJob {
  private final SpaceTrackClient spaceTrackClient;
  private final ConjunctionRepository conjunctions;
  private final RiskClassifier riskClassifier;

  public CdmRefreshJob(
      SpaceTrackClient spaceTrackClient,
      ConjunctionRepository conjunctions,
      RiskClassifier riskClassifier) {
    this.spaceTrackClient = spaceTrackClient;
    this.conjunctions = conjunctions;
    this.riskClassifier = riskClassifier;
  }

  public int refreshPublicCdms() {
    JsonNode records = spaceTrackClient.fetchPublicCdms();
    if (records == null || !records.isArray()) {
      return 0;
    }

    int count = 0;
    for (JsonNode record : records) {
      ConjunctionRecord normalized = normalize(record);
      conjunctions.upsert(normalized);
      count++;
    }
    return count;
  }

  private ConjunctionRecord normalize(JsonNode cdm) {
    double missDistanceKm = doubleValue(cdm, "MIN_RNG");
    Double probability = nullableDouble(cdm, "PC");
    Double relativeVelocity = firstNullableDouble(cdm, "RELATIVE_SPEED", "REL_SPEED", "RELATIVE_VELOCITY");
    return new ConjunctionRecord(
        "space-track-cdm-" + textValue(cdm, "CDM_ID"),
        intValue(cdm, "SAT_1_ID"),
        intValue(cdm, "SAT_2_ID"),
        textValue(cdm, "SAT_1_NAME"),
        textValue(cdm, "SAT_2_NAME"),
        instantValue(cdm, "CREATED"),
        instantValue(cdm, "TCA"),
        missDistanceKm,
        probability,
        relativeVelocity,
        riskClassifier.classify(missDistanceKm, probability),
        "space-track",
        cdm.toString());
  }

  private static String textValue(JsonNode node, String field) {
    return node.path(field).asText("");
  }

  private static int intValue(JsonNode node, String field) {
    return node.path(field).asInt();
  }

  private static double doubleValue(JsonNode node, String field) {
    return node.path(field).asDouble();
  }

  private static Double nullableDouble(JsonNode node, String field) {
    JsonNode value = node.path(field);
    if (value.isMissingNode() || value.isNull() || value.asText("").isBlank()) {
      return null;
    }
    return value.asDouble();
  }

  private static Double firstNullableDouble(JsonNode node, String... fields) {
    for (String field : fields) {
      Double value = nullableDouble(node, field);
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  private static Instant instantValue(JsonNode node, String field) {
    String value = node.path(field).asText("");
    if (value.isBlank()) {
      return Instant.EPOCH;
    }
    String normalized = value.replace(' ', 'T');
    if (!normalized.endsWith("Z")) {
      normalized = normalized + "Z";
    }
    try {
      return Instant.parse(normalized);
    } catch (RuntimeException ignored) {
      return LocalDateTime.parse(value.replace(' ', 'T').substring(0, 19)).toInstant(ZoneOffset.UTC);
    }
  }
}
