package com.orbitvisualizationengine.server.api;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;

@RestControllerAdvice
public class ApiExceptionHandler {
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

  private static String fieldErrorMessage(FieldError error) {
    return error.getField() + " " + error.getDefaultMessage();
  }
}
