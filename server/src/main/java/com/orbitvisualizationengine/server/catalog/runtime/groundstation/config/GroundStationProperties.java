package com.orbitvisualizationengine.server.catalog.runtime.groundstation.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ground-stations")
public class GroundStationProperties {
  private List<Station> stations = new ArrayList<>();

  public List<Station> getStations() {
    return stations;
  }

  public void setStations(List<Station> stations) {
    this.stations = stations == null ? new ArrayList<>() : new ArrayList<>(stations);
  }

  public static class Station {
    private String id;
    private String name;
    private double latitudeDegrees;
    private double longitudeDegrees;
    private double altitudeMeters;
    private Map<String, String> attributes = new LinkedHashMap<>();

    public String getId() {
      return id;
    }

    public void setId(String id) {
      this.id = id;
    }

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public double getLatitudeDegrees() {
      return latitudeDegrees;
    }

    public void setLatitudeDegrees(double latitudeDegrees) {
      this.latitudeDegrees = latitudeDegrees;
    }

    public double getLongitudeDegrees() {
      return longitudeDegrees;
    }

    public void setLongitudeDegrees(double longitudeDegrees) {
      this.longitudeDegrees = longitudeDegrees;
    }

    public double getAltitudeMeters() {
      return altitudeMeters;
    }

    public void setAltitudeMeters(double altitudeMeters) {
      this.altitudeMeters = altitudeMeters;
    }

    public Map<String, String> getAttributes() {
      return attributes;
    }

    public void setAttributes(Map<String, String> attributes) {
      this.attributes = attributes == null ? new LinkedHashMap<>() : new LinkedHashMap<>(attributes);
    }
  }
}
