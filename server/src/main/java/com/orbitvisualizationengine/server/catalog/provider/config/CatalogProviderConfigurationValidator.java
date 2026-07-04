package com.orbitvisualizationengine.server.catalog.provider.config;

import com.orbitvisualizationengine.server.catalog.provider.CatalogDataFormat;
import com.orbitvisualizationengine.server.catalog.provider.CatalogEndpoint;
import com.orbitvisualizationengine.server.catalog.provider.exception.ProviderConfigurationException;
import jakarta.annotation.PostConstruct;
import java.util.HashSet;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class CatalogProviderConfigurationValidator {
  private final CatalogProviderProperties properties;

  public CatalogProviderConfigurationValidator(CatalogProviderProperties properties) {
    this.properties = properties;
  }

  @PostConstruct
  void validate() {
    Set<String> codes = new HashSet<>();
    for (CatalogProviderProperties.Provider provider : properties.providers().values()) {
      if (!codes.add(provider.code())) {
        throw new ProviderConfigurationException("Duplicate catalog provider code: " + provider.code());
      }
      if (!provider.formats().containsAll(provider.endpoints().values().stream().map(CatalogProviderProperties.Endpoint::format).toList())) {
        throw new ProviderConfigurationException("Catalog provider " + provider.code() + " declares an endpoint format it does not support");
      }
      if (provider.ingestion() != null) {
        require(provider, provider.ingestion().endpoint(), provider.ingestion().expectedFormat());
      }
    }

    CatalogProviderProperties.Provider celestrak = properties.providers().get("celestrak");
    if (celestrak == null || !celestrak.enabled()) {
      throw new ProviderConfigurationException("Enabled CelesTrak provider configuration is required");
    }
    require(celestrak, CatalogEndpoint.GROUP_ELEMENTS_JSON, CatalogDataFormat.JSON);
    require(celestrak, CatalogEndpoint.GROUP_TLE, CatalogDataFormat.TLE);
    require(celestrak, CatalogEndpoint.NORAD_TLE, CatalogDataFormat.TLE);
    require(celestrak, CatalogEndpoint.LEGACY_GROUP_TLE, CatalogDataFormat.TLE);
  }

  private void require(CatalogProviderProperties.Provider provider, CatalogEndpoint endpoint, CatalogDataFormat format) {
    CatalogProviderProperties.Endpoint definition = provider.endpoints().get(endpoint);
    if (definition == null) {
      throw new ProviderConfigurationException("Catalog provider " + provider.code() + " is missing endpoint " + endpoint);
    }
    if (definition.format() != format) {
      throw new ProviderConfigurationException("Catalog provider " + provider.code() + " endpoint " + endpoint + " must use " + format);
    }
  }
}
