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
        .filter(event -> event.type() != TimelineEventType.COAST)
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
    if (event.type() == TimelineEventType.IMPULSIVE_BURN) {
      return toImpulsiveBurnCommand(event);
    }
    if (event.type() != TimelineEventType.FINITE_BURN) {
      throw new IllegalArgumentException("Timeline event type " + event.type() + " is not supported by Phase B propagation bridge.");
    }

    return toFiniteBurnCommand(event);
  }

  private PropagationManeuverCommand toFiniteBurnCommand(MissionTimelineEvent event) {
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
        0.0,
        0.0,
        0.0,
        event.enabled(),
        parameters);
  }

  private PropagationManeuverCommand toImpulsiveBurnCommand(MissionTimelineEvent event) {
    Map<String, Object> parameters = event.parameters() == null ? Map.of() : event.parameters();
    double ispSeconds = requiredPositiveNumber(parameters, "ispSeconds", event.id(), TimelineEventType.IMPULSIVE_BURN);
    String directionFrame = requiredString(parameters, "directionFrame", event.id(), TimelineEventType.IMPULSIVE_BURN);
    double deltaVxMps = requiredNumber(parameters, "deltaVxMps", event.id(), TimelineEventType.IMPULSIVE_BURN);
    double deltaVyMps = requiredNumber(parameters, "deltaVyMps", event.id(), TimelineEventType.IMPULSIVE_BURN);
    double deltaVzMps = requiredNumber(parameters, "deltaVzMps", event.id(), TimelineEventType.IMPULSIVE_BURN);

    if (deltaVxMps == 0.0 && deltaVyMps == 0.0 && deltaVzMps == 0.0) {
      throw new IllegalArgumentException("IMPULSIVE_BURN delta-v vector must be non-zero: " + event.id());
    }

    return new PropagationManeuverCommand(
        event.id(),
        PropagationManeuverType.IMPULSIVE_BURN,
        requireInstant(event.executionTime(), event.id()),
        0.0,
        0.0,
        ispSeconds,
        directionFrame,
        0.0,
        0.0,
        0.0,
        deltaVxMps,
        deltaVyMps,
        deltaVzMps,
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
    return requiredPositiveNumber(parameters, key, eventId, TimelineEventType.FINITE_BURN);
  }

  private double requiredPositiveNumber(Map<String, Object> parameters, String key, String eventId, TimelineEventType type) {
    double value = requiredNumber(parameters, key, eventId, type);
    if (value <= 0.0) {
      throw new IllegalArgumentException(type + " parameter " + key + " must be greater than zero: " + eventId);
    }
    return value;
  }

  private double requiredNumber(Map<String, Object> parameters, String key, String eventId) {
    return requiredNumber(parameters, key, eventId, TimelineEventType.FINITE_BURN);
  }

  private double requiredNumber(Map<String, Object> parameters, String key, String eventId, TimelineEventType type) {
    Object value = parameters.get(key);
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    throw new IllegalArgumentException(type + " parameter " + key + " is required and must be numeric: " + eventId);
  }

  private String requiredString(Map<String, Object> parameters, String key, String eventId) {
    return requiredString(parameters, key, eventId, TimelineEventType.FINITE_BURN);
  }

  private String requiredString(Map<String, Object> parameters, String key, String eventId, TimelineEventType type) {
    Object value = parameters.get(key);
    if (value instanceof String text && !text.isBlank()) {
      return text;
    }
    throw new IllegalArgumentException(type + " parameter " + key + " is required: " + eventId);
  }
}
