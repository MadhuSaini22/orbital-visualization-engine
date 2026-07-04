package com.orbitvisualizationengine.server.catalog.provider.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.CatalogFetchRequest;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderResponse;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSource;
import com.orbitvisualizationengine.server.catalog.provider.CatalogSourceDescriptor;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderDescriptorFactory;
import com.orbitvisualizationengine.server.catalog.provider.config.CatalogProviderProperties;
import com.orbitvisualizationengine.server.catalog.provider.dto.CelestrakGpCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.dto.CelestrakGpElement;
import com.orbitvisualizationengine.server.catalog.provider.dto.TleCatalogResponse;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderCapabilityException;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderResponseException;
import com.orbitvisualizationengine.server.catalog.provider.http.CatalogHttpClient;
import com.orbitvisualizationengine.server.catalog.provider.http.CatalogHttpRequest;
import com.orbitvisualizationengine.server.catalog.provider.parser.TleParser;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class CelestrakCatalogSource implements CatalogSource {
  public static final String PROVIDER_CODE = "celestrak";

  private final CatalogProviderProperties properties;
  private final CatalogProviderProperties.Provider provider;
  private final CatalogSourceDescriptor descriptor;
  private final CatalogHttpClient httpClient;
  private final ObjectMapper mapper;
  private final TleParser tleParser;

  public CelestrakCatalogSource(
      CatalogProviderProperties properties,
      CatalogProviderDescriptorFactory descriptorFactory,
      CatalogHttpClient httpClient,
      ObjectMapper mapper,
      TleParser tleParser) {
    this.properties = properties;
    this.provider = properties.requiredProvider(PROVIDER_CODE);
    this.descriptor = descriptorFactory.from(provider);
    this.httpClient = httpClient;
    this.mapper = mapper;
    this.tleParser = tleParser;
  }

  @Override
  public CatalogSourceDescriptor descriptor() {
    return descriptor;
  }

  @Override
  public CatalogProviderResponse<?> fetch(CatalogFetchRequest request) {
    ensureEndpoint(request.endpoint(), request.expectedFormat());
    return switch (request.expectedFormat()) {
      case JSON, OMM -> fetchJsonCatalog(request);
      case TLE -> fetchTleCatalog(request);
    };
  }

  private CatalogProviderResponse<CelestrakGpCatalogResponse> fetchJsonCatalog(CatalogFetchRequest request) {
    JsonNode payload = httpClient.getJson(httpRequest(request));
    if (payload == null || !payload.isArray()) {
      throw new ProviderResponseException(PROVIDER_CODE, "CelesTrak JSON response must be an array");
    }

    List<CelestrakGpElement> records = new ArrayList<>();
    for (JsonNode element : payload) {
      try {
        records.add(mapper.treeToValue(element, CelestrakGpElement.class));
      } catch (Exception exception) {
        throw new ProviderResponseException(PROVIDER_CODE, "Unable to parse CelesTrak GP element", exception);
      }
    }

    return new CatalogProviderResponse<>(
        descriptor,
        request.endpoint(),
        request.expectedFormat(),
        Instant.now(),
        new CelestrakGpCatalogResponse(records, payload));
  }

  private CatalogProviderResponse<TleCatalogResponse> fetchTleCatalog(CatalogFetchRequest request) {
    String text = httpClient.getText(httpRequest(request));
    TleCatalogResponse body = tleParser.parseTle(PROVIDER_CODE, text);
    return new CatalogProviderResponse<>(descriptor, request.endpoint(), CatalogDataFormat.TLE, Instant.now(), body);
  }

  private CatalogHttpRequest httpRequest(CatalogFetchRequest request) {
    return new CatalogHttpRequest(PROVIDER_CODE, resolveUri(request), request.expectedFormat(), properties.defaultUserAgent());
  }

  private URI resolveUri(CatalogFetchRequest request) {
    CatalogProviderProperties.Endpoint endpoint = provider.requiredEndpoint(request.endpoint());
    UriComponentsBuilder builder = UriComponentsBuilder.fromUri(provider.baseUrl()).path(endpoint.path());
    endpoint.queryParameters().forEach(builder::queryParam);
    request.queryParameters().forEach((key, value) -> builder.queryParam(endpoint.queryParameterAliases().getOrDefault(key, key), value));
    return builder.buildAndExpand(request.pathParameters()).toUri();
  }

  private void ensureEndpoint(CatalogEndpoint endpoint, CatalogDataFormat expectedFormat) {
    CatalogProviderProperties.Endpoint definition = provider.requiredEndpoint(endpoint);
    if (definition.format() != expectedFormat) {
      throw new ProviderCapabilityException(PROVIDER_CODE, "Endpoint " + endpoint + " does not support " + expectedFormat);
    }
    if (!provider.formats().contains(expectedFormat)) {
      throw new ProviderCapabilityException(PROVIDER_CODE, "Provider does not support " + expectedFormat);
    }
  }
}
