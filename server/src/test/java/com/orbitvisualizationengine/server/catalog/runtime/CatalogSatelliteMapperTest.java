package com.orbitvisualizationengine.server.catalog.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.mapper.CatalogSatelliteMapper;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class CatalogSatelliteMapperTest {
  private final CatalogSatelliteMapper mapper = new CatalogSatelliteMapper();

  @Test
  void mapsRepositoryRecordIntoRuntimeModel() {
    CatalogSatellite satellite = mapper.toSatellite(CatalogRuntimeTestFixtures.record(25544, "ISS"));

    assertThat(satellite.noradCatalogId()).isEqualTo(25544);
    assertThat(satellite.catalogVersionId()).isEqualTo(101);
    assertThat(satellite.historyId()).isEqualTo(501);
    assertThat(satellite.sourceCode()).isEqualTo("celestrak");
    assertThat(satellite.objectName()).isEqualTo("ISS");
    assertThat(satellite.epochAt()).isEqualTo(Instant.parse("2024-06-12T12:25:40.104192Z"));
    assertThat(satellite.tleLine1()).startsWith("1 25544U");
    assertThat(satellite.tleLine2()).startsWith("2 25544");
    assertThat(satellite.tleSha256()).isEqualTo("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    assertThat(satellite.inclinationDeg()).isEqualByComparingTo(new BigDecimal("51.6395"));
    assertThat(satellite.firstSeenVersionId()).isEqualTo(1);
    assertThat(satellite.lastSeenVersionId()).isEqualTo(101);
  }
}
