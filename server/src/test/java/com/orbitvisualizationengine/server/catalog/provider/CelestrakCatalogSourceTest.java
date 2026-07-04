package com.orbitvisualizationengine.server.catalog.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderDescriptorFactory;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderProperties;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.http.CatalogHttpClient;
import com.orbitvisualizationengine.server.catalog.provider.http.CatalogHttpRequest;
import com.orbitvisualizationengine.server.catalog.provider.impl.CelestrakCatalogSource;
import com.orbitvisualizationengine.server.catalog.provider.parser.TleParser;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CelestrakCatalogSourceTest {
  private static final String ISS_TLE = String.join("\n",
      "ISS (ZARYA)",
      "1 25544U 98067A   24164.51782528  .00016717  00000+0  30135-3 0  9995",
      "2 25544  51.6416  35.5880 0005217  94.0174  34.5327 15.50011406457333");

  @Test
  void fetchUsesConfiguredTleEndpointAndParsesStrongDto() {
    FakeHttpClient http = new FakeHttpClient(ISS_TLE);
    CelestrakCatalogSource source = source(http);

    CatalogFetchRequest request = new CatalogFetchRequest(
        CatalogEndpoint.GROUP_TLE,
        CatalogDataFormat.TLE,
        Map.of(),
        Map.of("group", "stations"));
    TleCatalogResponse response = (TleCatalogResponse) source.fetch(request).body();

    assertEquals(URI.create("https://example.test/NORAD/elements/gp.php?FORMAT=TLE&GROUP=stations"), http.lastRequest.uri());
    assertEquals(1, response.records().size());
    assertEquals(25544, response.records().getFirst().noradCatalogId());
    assertEquals("ISS (ZARYA)", response.records().getFirst().objectName());
  }

  @Test
  void registryResolvesProviderByCode() {
    CelestrakCatalogSource source = source(new FakeHttpClient(ISS_TLE));
    CatalogProviderRegistry registry = new CatalogProviderRegistry(List.of(source));

    assertEquals(source, registry.require("celestrak"));
    assertTrue(registry.descriptors().iterator().next().supports(CatalogCapability.TLE));
  }

  private CelestrakCatalogSource source(CatalogHttpClient httpClient) {
    ObjectMapper mapper = new ObjectMapper();
    return new CelestrakCatalogSource(properties(), new CatalogProviderDescriptorFactory(), httpClient, mapper, new TleParser(mapper));
  }

  private CatalogProviderProperties properties() {
    CatalogProviderProperties.Endpoint groupJson = endpoint(
        "/NORAD/elements/gp.php",
        CatalogDataFormat.JSON,
        Map.of("FORMAT", "JSON"),
        Map.of("group", "GROUP"));
    CatalogProviderProperties.Endpoint groupTle = endpoint(
        "/NORAD/elements/gp.php",
        CatalogDataFormat.TLE,
        Map.of("FORMAT", "TLE"),
        Map.of("group", "GROUP"));
    CatalogProviderProperties.Endpoint noradTle = endpoint(
        "/NORAD/elements/gp.php",
        CatalogDataFormat.TLE,
        Map.of("FORMAT", "TLE"),
        Map.of("noradId", "CATNR"));
    CatalogProviderProperties.Endpoint legacyTle = endpoint(
        "/NORAD/elements/{group}.txt",
        CatalogDataFormat.TLE,
        Map.of(),
        Map.of());

    CatalogProviderProperties.Provider provider = new CatalogProviderProperties.Provider(
        "celestrak",
        "CelesTrak",
        CatalogProviderType.PUBLIC,
        true,
        URI.create("https://example.test"),
        Set.of(CatalogCapability.TLE, CatalogCapability.OMM, CatalogCapability.GROUP_QUERY, CatalogCapability.NORAD_QUERY),
        Set.of(CatalogDataFormat.JSON, CatalogDataFormat.TLE, CatalogDataFormat.OMM),
        Map.of(
            CatalogEndpoint.GROUP_ELEMENTS_JSON, groupJson,
            CatalogEndpoint.GROUP_TLE, groupTle,
            CatalogEndpoint.NORAD_TLE, noradTle,
            CatalogEndpoint.LEGACY_GROUP_TLE, legacyTle));

    return new CatalogProviderProperties("test-agent", Map.of("celestrak", provider));
  }

  private CatalogProviderProperties.Endpoint endpoint(
      String path,
      CatalogDataFormat format,
      Map<String, String> queryParameters,
      Map<String, String> queryParameterAliases) {
    return new CatalogProviderProperties.Endpoint(path, format, false, queryParameters, queryParameterAliases);
  }

  private static final class FakeHttpClient implements CatalogHttpClient {
    private final String text;
    private CatalogHttpRequest lastRequest;

    private FakeHttpClient(String text) {
      this.text = text;
    }

    @Override
    public String getText(CatalogHttpRequest request) {
      this.lastRequest = request;
      return text;
    }

    @Override
    public JsonNode getJson(CatalogHttpRequest request) {
      throw new UnsupportedOperationException("JSON fetch is not used by this test");
    }
  }
}
