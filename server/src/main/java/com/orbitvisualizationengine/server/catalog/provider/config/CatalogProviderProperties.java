package com.orbitvisualizationengine.server.catalog.provider.config;

import com.orbitvisualizationengine.server.catalog.provider.CatalogCapability;
import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.CatalogProviderType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "catalog-providers")
public record CatalogProviderProperties(
    @NotBlank String defaultUserAgent,
    @NotEmpty Map<String, @Valid Provider> providers) {

  public CatalogProviderProperties {
    providers = Map.copyOf(providers);
  }

  public Provider requiredProvider(String code) {
    Provider provider = providers.get(code);
    if (provider == null) {
      throw new IllegalArgumentException("Catalog provider is not configured: " + code);
    }
    return provider;
  }

  public record Provider(
      @NotBlank String code,
      @NotBlank String displayName,
      @NotNull CatalogProviderType providerType,
      boolean enabled,
      @NotNull URI baseUrl,
      @NotEmpty Set<CatalogCapability> capabilities,
      @NotEmpty Set<CatalogDataFormat> formats,
      @Valid Ingestion ingestion,
      @NotEmpty Map<CatalogEndpoint, @Valid Endpoint> endpoints) {

    public Provider {
      capabilities = Set.copyOf(capabilities);
      formats = Set.copyOf(formats);
      endpoints = Map.copyOf(endpoints);
    }

    public Endpoint requiredEndpoint(CatalogEndpoint endpoint) {
      Endpoint definition = endpoints.get(endpoint);
      if (definition == null) {
        throw new IllegalArgumentException("Catalog provider " + code + " is missing endpoint " + endpoint);
      }
      return definition;
    }
  }

  public record Ingestion(
      @NotNull CatalogEndpoint endpoint,
      @NotNull CatalogDataFormat expectedFormat,
      Map<String, String> pathParameters,
      Map<String, String> queryParameters) {

    public Ingestion {
      pathParameters = pathParameters == null ? Map.of() : Map.copyOf(pathParameters);
      queryParameters = queryParameters == null ? Map.of() : Map.copyOf(queryParameters);
    }
  }

  public record Endpoint(
      @NotBlank String path,
      @NotNull CatalogDataFormat format,
      boolean authenticated,
      Map<String, String> queryParameters,
      Map<String, String> queryParameterAliases) {

    public Endpoint {
      queryParameters = queryParameters == null ? Map.of() : Map.copyOf(queryParameters);
      queryParameterAliases = queryParameterAliases == null ? Map.of() : Map.copyOf(queryParameterAliases);
    }
  }

}
