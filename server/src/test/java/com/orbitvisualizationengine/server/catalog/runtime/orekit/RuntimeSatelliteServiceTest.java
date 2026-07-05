package com.orbitvisualizationengine.server.catalog.runtime.orekit;

import static org.assertj.core.api.Assertions.assertThat;

import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogService;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class RuntimeSatelliteServiceTest {
  private final OrekitTleFactory tleFactory = new OrekitTleFactory();
  private final OrekitPropagatorFactory propagatorFactory = new OrekitPropagatorFactory(tleFactory);

  @BeforeAll
  static void initOrekit() {
    OrekitTestDataLoader.ensureLoaded();
  }

  @Test
  void createsRuntimeSatelliteFromCatalogSatellite() {
    RuntimeSatelliteService service = new RuntimeSatelliteService(
        new FakeCatalogService(RuntimeOrekitTestFixtures.catalogSatellite()),
        tleFactory,
        propagatorFactory);

    RuntimeSatellite runtimeSatellite = service.createRuntimeSatellite(RuntimeOrekitTestFixtures.catalogSatellite());

    assertThat(runtimeSatellite.catalogSatellite().noradCatalogId()).isEqualTo(25544);
    assertThat(runtimeSatellite.tle().getSatelliteNumber()).isEqualTo(25544);
    assertThat(runtimeSatellite.propagator()).isNotNull();
  }

  @Test
  void loadsCatalogSatelliteByNoradIdThroughCatalogServiceOnly() {
    FakeCatalogService catalogService = new FakeCatalogService(RuntimeOrekitTestFixtures.catalogSatellite());
    RuntimeSatelliteService service = new RuntimeSatelliteService(catalogService, tleFactory, propagatorFactory);

    RuntimeSatellite runtimeSatellite = service.findByNoradId(25544);

    assertThat(catalogService.lastNoradCatalogId).isEqualTo(25544);
    assertThat(runtimeSatellite.catalogSatellite().objectName()).isEqualTo("ISS");
    assertThat(runtimeSatellite.propagator()).isNotNull();
  }

  private static final class FakeCatalogService extends CatalogService {
    private final CatalogSatellite satellite;
    private int lastNoradCatalogId;

    private FakeCatalogService(CatalogSatellite satellite) {
      super(null, null);
      this.satellite = satellite;
    }

    @Override
    public CatalogSatellite findByNoradId(int noradCatalogId) {
      lastNoradCatalogId = noradCatalogId;
      return satellite;
    }
  }
}
