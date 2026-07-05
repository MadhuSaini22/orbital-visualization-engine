package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.orekit.propagation.analytical.tle.TLE;
import org.orekit.propagation.analytical.tle.TLEPropagator;

class OrekitPropagatorFactoryTest {
  private final OrekitTleFactory tleFactory = new OrekitTleFactory();
  private final OrekitPropagatorFactory propagatorFactory = new OrekitPropagatorFactory(tleFactory);

  @BeforeAll
  static void initOrekit() {
    OrekitTestDataLoader.ensureLoaded();
  }

  @Test
  void createsTlePropagatorFromCatalogSatellite() {
    TLEPropagator propagator = propagatorFactory.createPropagator(RuntimeOrekitTestFixtures.catalogSatellite());

    assertThat(propagator).isNotNull();
  }

  @Test
  void createsTlePropagatorFromOrekitTle() {
    TLE tle = tleFactory.createTle(RuntimeOrekitTestFixtures.catalogSatellite());

    TLEPropagator propagator = propagatorFactory.createPropagator(tle);

    assertThat(propagator).isNotNull();
  }
}
