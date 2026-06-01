package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class MissionTimelineValidator {
  public void validateMissionWindow(Instant start, Instant end) {
    if (start == null) {
      throw new IllegalArgumentException("Mission scenario start is required.");
    }
    if (end == null) {
      throw new IllegalArgumentException("Mission scenario end is required.");
    }
    if (!start.isBefore(end)) {
      throw new IllegalArgumentException("Mission scenario start must be before scenario end.");
    }
  }

  public void validateEventFields(
      Mission mission,
      TimelineEventType type,
      String name,
      Boolean enabled,
      Instant executionTime,
      Integer sequenceIndex,
      int timelineSize,
      boolean allowAppend) {
    if (type == null) {
      throw new IllegalArgumentException("Timeline event type is required.");
    }
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("Timeline event name is required.");
    }
    if (enabled == null) {
      throw new IllegalArgumentException("Timeline event enabled flag is required.");
    }
    if (executionTime == null) {
      throw new IllegalArgumentException("Timeline event execution time is required.");
    }
    if (sequenceIndex == null) {
      throw new IllegalArgumentException("Timeline event sequence index is required.");
    }
    if (executionTime.isBefore(mission.scenarioStart()) || executionTime.isAfter(mission.scenarioEnd())) {
      throw new IllegalArgumentException("Timeline event execution time must fall within the mission scenario window.");
    }

    int maxIndex = allowAppend ? timelineSize : Math.max(0, timelineSize - 1);
    if (sequenceIndex < 0 || sequenceIndex > maxIndex) {
      throw new IllegalArgumentException("Timeline event sequence index is outside the valid range.");
    }
  }

  public void validateOrdering(List<MissionTimelineEvent> events) {
    Set<Integer> indices = new HashSet<>();
    for (MissionTimelineEvent event : events) {
      if (event.sequenceIndex() < 0) {
        throw new IllegalArgumentException("Timeline sequence index must not be negative.");
      }
      if (!indices.add(event.sequenceIndex())) {
        throw new IllegalArgumentException("Timeline sequence indices must be unique.");
      }
    }
    for (int expected = 0; expected < events.size(); expected++) {
      if (!indices.contains(expected)) {
        throw new IllegalArgumentException("Timeline sequence indices must be contiguous from zero.");
      }
    }
  }

  public void validateReorderRequest(List<MissionTimelineEvent> existing, List<String> requestedIds) {
    if (requestedIds == null || requestedIds.isEmpty()) {
      throw new IllegalArgumentException("Timeline reorder request must include event ids.");
    }
    if (requestedIds.size() != existing.size()) {
      throw new IllegalArgumentException("Timeline reorder request must include every event exactly once.");
    }

    Set<String> existingIds = new HashSet<>();
    for (MissionTimelineEvent event : existing) {
      existingIds.add(event.id());
    }

    Set<String> requestedUniqueIds = new HashSet<>(requestedIds);
    if (requestedUniqueIds.size() != requestedIds.size()) {
      throw new IllegalArgumentException("Timeline reorder request contains duplicate event ids.");
    }
    if (!requestedUniqueIds.equals(existingIds)) {
      throw new IllegalArgumentException("Timeline reorder request must reference only events in the mission timeline.");
    }
  }
}
