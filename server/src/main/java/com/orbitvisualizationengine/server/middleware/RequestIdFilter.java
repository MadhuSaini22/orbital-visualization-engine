package com.orbitvisualizationengine.server.middleware;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestIdFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String requestId = request.getHeader("X-Request-Id");
    if (requestId == null || requestId.isBlank()) {
      requestId = UUID.randomUUID().toString();
    }

    MDC.put("requestId", requestId);
    response.setHeader("X-Request-Id", requestId);
    try {
      chain.doFilter(request, response);
    } finally {
      MDC.remove("requestId");
    }
  }
}
