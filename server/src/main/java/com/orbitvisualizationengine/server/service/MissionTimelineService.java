package com.orbitvisualizationengine.server.service;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.dto.CreateTimelineEventRequest;
import com.orbitvisualizationengine.server.dto.UpdateTimelineEventRequest;
import com.orbitvisualizationengine.server.repository.MissionTimelineEventRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MissionTimelineService {
  private final MissionService missions;
  private final MissionTimelineEventRepository events;
  private final MissionTimelineValidator validator;
  private final ConcurrentMap<String, Object> missionMutationLocks = new ConcurrentHashMap<>();

  public MissionTimelineService(
      MissionService missions,
      MissionTimelineEventRepository events,
      MissionTimelineValidator validator) {
    this.missions = missions;
    this.events = events;
    this.validator = validator;
  }

  public List<MissionTimelineEvent> list(String missionId) {
    missions.get(missionId);
    List<MissionTimelineEvent> timeline = events.findByMissionId(missionId);
    validator.validateOrdering(timeline);
    return timeline;
  }

  @Transactional
  public MissionTimelineEvent create(String missionId, CreateTimelineEventRequest request) {
    return withMissionMutationLock(missionId, () -> createLocked(missionId, request));
  }

  private MissionTimelineEvent createLocked(String missionId, CreateTimelineEventRequest request) {
    Mission mission = missions.lockForTimelineMutation(missionId);
    List<MissionTimelineEvent> existing = events.findByMissionId(missionId);
    validator.validateOrdering(existing);
    validator.validateEventFields(
        mission,
        request.type(),
        request.name(),
        request.enabled(),
        request.executionTime(),
        request.sequenceIndex(),
        existing.size(),
        true);

    Instant now = Instant.now();
    MissionTimelineEvent created = new MissionTimelineEvent(
        "timeline-event-" + UUID.randomUUID(),
        missionId,
        existing.size(),
        request.type(),
        request.name().trim(),
        request.enabled(),
        request.executionTime(),
        request.parameters() == null ? Map.of() : request.parameters(),
        now,
        now);
    events.save(created);

    List<String> reordered = new ArrayList<>(existing.stream()
        .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
        .map(MissionTimelineEvent::id)
        .toList());
    reordered.add(request.sequenceIndex(), created.id());
    try {
      events.resequence(missionId, reordered);
    } catch (RuntimeException exception) {
      events.delete(missionId, created.id());
      throw exception;
    }
    return get(missionId, created.id());
  }

  @Transactional
  public MissionTimelineEvent update(String missionId, String eventId, UpdateTimelineEventRequest request) {
    return withMissionMutationLock(missionId, () -> updateLocked(missionId, eventId, request));
  }

  private MissionTimelineEvent updateLocked(String missionId, String eventId, UpdateTimelineEventRequest request) {
    Mission mission = missions.lockForTimelineMutation(missionId);
    MissionTimelineEvent current = get(missionId, eventId);
    List<MissionTimelineEvent> existing = events.findByMissionId(missionId);
    validator.validateOrdering(existing);

    MissionTimelineEvent next = new MissionTimelineEvent(
        current.id(),
        current.missionId(),
        current.sequenceIndex(),
        request.type() == null ? current.type() : request.type(),
        request.name() == null ? current.name() : request.name().trim(),
        request.enabled() == null ? current.enabled() : request.enabled(),
        request.executionTime() == null ? current.executionTime() : request.executionTime(),
        request.parameters() == null ? current.parameters() : request.parameters(),
        current.createdAt(),
        Instant.now());

    validator.validateEventFields(
        mission,
        next.type(),
        next.name(),
        next.enabled(),
        next.executionTime(),
        next.sequenceIndex(),
        existing.size(),
        false);
    return events.save(next);
  }

  @Transactional
  public void delete(String missionId, String eventId) {
    withMissionMutationLock(missionId, () -> {
      deleteLocked(missionId, eventId);
      return null;
    });
  }

  private void deleteLocked(String missionId, String eventId) {
    missions.lockForTimelineMutation(missionId);
    MissionTimelineEvent current = get(missionId, eventId);
    List<MissionTimelineEvent> existing = events.findByMissionId(missionId);
    List<String> originalOrder = existing.stream()
        .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
        .map(MissionTimelineEvent::id)
        .toList();
    List<String> remaining = existing.stream()
        .filter(event -> !event.id().equals(current.id()))
        .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
        .map(MissionTimelineEvent::id)
        .toList();
    events.delete(missionId, eventId);
    if (!remaining.isEmpty()) {
      try {
        events.resequence(missionId, remaining);
      } catch (RuntimeException exception) {
        events.save(current);
        events.resequence(missionId, originalOrder);
        throw exception;
      }
    }
  }

  @Transactional
  public List<MissionTimelineEvent> reorder(String missionId, List<String> eventIds) {
    return withMissionMutationLock(missionId, () -> reorderLocked(missionId, eventIds));
  }

  private List<MissionTimelineEvent> reorderLocked(String missionId, List<String> eventIds) {
    missions.lockForTimelineMutation(missionId);
    List<MissionTimelineEvent> existing = events.findByMissionId(missionId);
    validator.validateOrdering(existing);
    validator.validateReorderRequest(existing, eventIds);
    List<String> originalOrder = existing.stream()
        .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
        .map(MissionTimelineEvent::id)
        .toList();
    try {
      events.resequence(missionId, eventIds);
    } catch (RuntimeException exception) {
      events.resequence(missionId, originalOrder);
      throw exception;
    }
    return list(missionId);
  }

  @Transactional
  public MissionTimelineEvent setEnabled(String missionId, String eventId, boolean enabled) {
    return withMissionMutationLock(missionId, () -> setEnabledLocked(missionId, eventId, enabled));
  }

  private MissionTimelineEvent setEnabledLocked(String missionId, String eventId, boolean enabled) {
    missions.lockForTimelineMutation(missionId);
    MissionTimelineEvent current = get(missionId, eventId);
    return updateLocked(missionId, eventId, new UpdateTimelineEventRequest(
        current.type(),
        current.name(),
        enabled,
        current.executionTime(),
        current.parameters()));
  }

  private MissionTimelineEvent get(String missionId, String eventId) {
    return events.findById(missionId, eventId)
        .orElseThrow(() -> new IllegalArgumentException("Mission timeline event not found: " + eventId));
  }

  private <T> T withMissionMutationLock(String missionId, TimelineMutation<T> mutation) {
    Object lock = missionMutationLocks.computeIfAbsent(missionId, ignored -> new Object());
    synchronized (lock) {
      return mutation.run();
    }
  }

  @FunctionalInterface
  private interface TimelineMutation<T> {
    T run();
  }
}
