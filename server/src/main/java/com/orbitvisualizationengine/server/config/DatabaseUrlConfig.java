package com.orbitvisualizationengine.server.config;

import java.net.URI;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class DatabaseUrlConfig {
  @Bean
  DataSource dataSource(DataSourceProperties properties, Environment environment) {
    String explicitJdbcUrl = properties.getUrl();
    if (explicitJdbcUrl != null && !explicitJdbcUrl.isBlank()) {
      return properties.initializeDataSourceBuilder().build();
    }

    String databaseUrl = environment.getProperty("DATABASE_URL");
    if (databaseUrl == null || databaseUrl.isBlank()) {
      return properties.initializeDataSourceBuilder().build();
    }

    URI uri = URI.create(databaseUrl);
    String[] userInfo = uri.getUserInfo() == null ? new String[] {"", ""} : uri.getUserInfo().split(":", 2);
    String query = uri.getQuery() == null ? "" : "?" + uri.getQuery();
    String port = uri.getPort() == -1 ? "" : ":" + uri.getPort();
    String jdbcUrl = "jdbc:postgresql://" + uri.getHost() + port + uri.getPath() + query;

    return DataSourceBuilder.create()
        .url(jdbcUrl)
        .username(userInfo.length > 0 ? userInfo[0] : "")
        .password(userInfo.length > 1 ? userInfo[1] : "")
        .build();
  }
}
