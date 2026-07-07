package com.orbitvisualizationengine.server.api;

import com.orbitvisualizationengine.server.catalog.runtime.exception.CatalogSatelliteNotFoundException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(CatalogSatelliteNotFoundException.class)
  ResponseEntity<Map<String, Object>> notFound(CatalogSatelliteNotFoundException exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", exception.getMessage()));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException exception) {
    return ResponseEntity.badRequest().body(Map.of("error", exception.getMessage()));
  }

  @ExceptionHandler(IllegalStateException.class)
  ResponseEntity<Map<String, Object>> dependencyError(IllegalStateException exception) {
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("error", exception.getMessage()));
  }

  @ExceptionHandler(RestClientResponseException.class)
  ResponseEntity<Map<String, Object>> upstreamError(RestClientResponseException exception) {
    return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
        "error", "External catalog request failed",
        "upstreamStatus", exception.getStatusCode().value()
    ));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<Map<String, Object>> malformedRequest(HttpMessageNotReadableException exception) {
    return ResponseEntity.badRequest().body(Map.of("error", "Request body is invalid"));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, Object>> validationError(MethodArgumentNotValidException exception) {
    var errors = exception.getBindingResult().getFieldErrors().stream()
        .map(ApiExceptionHandler::fieldErrorMessage)
        .toList();
    var message = errors.isEmpty()
        ? "Request validation failed"
        : "Request validation failed: " + String.join("; ", errors);
    return ResponseEntity.badRequest().body(Map.of(
        "error", message,
        "validationErrors", errors));
  }

  @ExceptionHandler(RuntimeException.class)
  ResponseEntity<Map<String, Object>> internalError(RuntimeException exception) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Internal server error"));
  }

  private static String fieldErrorMessage(FieldError error) {
    return error.getField() + " " + error.getDefaultMessage();
  }
}
