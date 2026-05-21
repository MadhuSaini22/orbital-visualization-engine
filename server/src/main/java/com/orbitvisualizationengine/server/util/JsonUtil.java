package com.orbitvisualizationengine.server.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class JsonUtil {
  private final ObjectMapper mapper;

  public JsonUtil(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String write(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Unable to serialize JSON payload", error);
    }
  }

  public Map<String, Object> readObjectMap(String json) {
    try {
      return mapper.readValue(json, new TypeReference<>() {});
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Unable to parse JSON payload", error);
    }
  }

  public Map<String, Double> readDoubleMap(String json) {
    try {
      return mapper.readValue(json, new TypeReference<>() {});
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("Unable to parse vector payload", error);
    }
  }
}
