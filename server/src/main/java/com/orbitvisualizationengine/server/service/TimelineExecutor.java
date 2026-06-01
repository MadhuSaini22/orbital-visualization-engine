package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverCommand;
import com.orbitvisualizationengine.server.propagation.PropagationManeuverType;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class TimelineExecutor {
  private final MissionTimelineValidator validator;

  public TimelineExecutor(MissionTimelineValidator validator) {
    this.validator = validator;
  }

  public List<PropagationManeuverCommand> toPropagationCommands(List<MissionTimelineEvent> events) {
    validator.validateOrdering(events);
    return events.stream()
        .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
        .filter(MissionTimelineEvent::enabled)
        .map(this::toPropagationCommand)
        .toList();
  }

  private PropagationManeuverCommand toPropagationCommand(MissionTimelineEvent event) {
    if (event.executionTime() == null) {
      throw new IllegalArgumentException("Timeline event execution time is required: " + event.id());
    }
    if (event.type() == null) {
      throw new IllegalArgumentException("Timeline event type is required: " + event.id());
    }
    if (event.type() != TimelineEventType.FINITE_BURN) {
      throw new IllegalArgumentException("Timeline event type " + event.type() + " is not supported by Phase B propagation bridge.");
    }

    Map<String, Object> parameters = event.parameters() == null ? Map.of() : event.parameters();
    double durationSeconds = requiredPositiveNumber(parameters, "durationSeconds", event.id());
    double thrustNewton = requiredPositiveNumber(parameters, "thrustNewton", event.id());
    double ispSeconds = requiredPositiveNumber(parameters, "ispSeconds", event.id());
    String directionFrame = requiredString(parameters, "directionFrame", event.id());
    double directionX = requiredNumber(parameters, "directionX", event.id());
    double directionY = requiredNumber(parameters, "directionY", event.id());
    double directionZ = requiredNumber(parameters, "directionZ", event.id());

    if (directionX == 0.0 && directionY == 0.0 && directionZ == 0.0) {
      throw new IllegalArgumentException("FINITE_BURN direction vector must be non-zero: " + event.id());
    }

    return new PropagationManeuverCommand(
        event.id(),
        PropagationManeuverType.FINITE_BURN,
        requireInstant(event.executionTime(), event.id()),
        durationSeconds,
        thrustNewton,
        ispSeconds,
        directionFrame,
        directionX,
        directionY,
        directionZ,
        event.enabled(),
        parameters);
  }

  private Instant requireInstant(Instant instant, String eventId) {
    if (instant == null) {
      throw new IllegalArgumentException("Timeline event execution time is required: " + eventId);
    }
    return instant;
  }

  private double requiredPositiveNumber(Map<String, Object> parameters, String key, String eventId) {
    double value = requiredNumber(parameters, key, eventId);
    if (value <= 0.0) {
      throw new IllegalArgumentException("FINITE_BURN parameter " + key + " must be greater than zero: " + eventId);
    }
    return value;
  }

  private double requiredNumber(Map<String, Object> parameters, String key, String eventId) {
    Object value = parameters.get(key);
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    throw new IllegalArgumentException("FINITE_BURN parameter " + key + " is required and must be numeric: " + eventId);
  }

  private String requiredString(Map<String, Object> parameters, String key, String eventId) {
    Object value = parameters.get(key);
    if (value instanceof String text && !text.isBlank()) {
      return text;
    }
    throw new IllegalArgumentException("FINITE_BURN parameter " + key + " is required: " + eventId);
  }
}
