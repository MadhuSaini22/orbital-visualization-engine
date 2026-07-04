package com.orbitvisualizationengine.server.catalog.provider.parser;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.catalog.provider.dto.ProviderTleRecord;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderResponseException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class TleParser {
  private final ObjectMapper mapper;

  public TleParser(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public TleCatalogResponse parseTle(String providerCode, String rawText) {
    if (rawText == null || rawText.isBlank()) {
      throw new ProviderResponseException(providerCode, "Provider returned an empty TLE response");
    }

    List<String> lines = new ArrayList<>();
    for (String line : rawText.split("\\R")) {
      if (!line.isBlank()) {
        lines.add(line.trim());
      }
    }

    if (lines.size() % 3 != 0) {
      throw new ProviderResponseException(providerCode, "TLE response must contain name/line1/line2 triples");
    }

    List<ProviderTleRecord> records = new ArrayList<>();
    for (int i = 0; i < lines.size(); i += 3) {
      String name = lines.get(i);
      String line1 = lines.get(i + 1);
      String line2 = lines.get(i + 2);
      validateTleLines(providerCode, line1, line2);
      records.add(new ProviderTleRecord(name, parseNoradId(providerCode, line1), line1, line2, tlePayload(name, line1, line2)));
    }

    return new TleCatalogResponse(records, rawText);
  }

  private JsonNode tlePayload(String name, String line1, String line2) {
    return mapper.createObjectNode()
        .put("name", name)
        .put("line1", line1)
        .put("line2", line2);
  }

  private void validateTleLines(String providerCode, String line1, String line2) {
    if (line1.length() != 69 || line2.length() != 69 || !line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      throw new ProviderResponseException(providerCode, "Provider returned malformed TLE lines");
    }
  }

  private int parseNoradId(String providerCode, String line1) {
    try {
      return Integer.parseInt(line1.substring(2, 7).trim());
    } catch (RuntimeException exception) {
      throw new ProviderResponseException(providerCode, "Unable to parse NORAD catalog ID from TLE", exception);
    }
  }
}
