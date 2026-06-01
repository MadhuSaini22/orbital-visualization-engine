package com.orbitvisualizationengine.server.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.orbitvisualizationengine.server.domain.Mission;
import com.orbitvisualizationengine.server.domain.MissionTimelineEvent;
import com.orbitvisualizationengine.server.domain.PropagatorType;
import com.orbitvisualizationengine.server.domain.TimelineEventType;
import com.orbitvisualizationengine.server.dto.CreateMissionRequest;
import com.orbitvisualizationengine.server.dto.CreateTimelineEventRequest;
import com.orbitvisualizationengine.server.dto.UpdateTimelineEventRequest;
import com.orbitvisualizationengine.server.repository.MissionRepository;
import com.orbitvisualizationengine.server.repository.MissionTimelineEventRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MissionTimelineServiceTest {
  private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");
  private static final Instant END = Instant.parse("2026-01-02T00:00:00Z");
  private static final Instant EVENT_TIME = Instant.parse("2026-01-01T01:00:00Z");

  private MissionService missions;
  private MissionTimelineService timeline;
  private InMemoryTimelineEventRepository eventRepository;

  @BeforeEach
  void setUp() {
    MissionTimelineValidator validator = new MissionTimelineValidator();
    MissionRepository missionRepository = new InMemoryMissionRepository();
    eventRepository = new InMemoryTimelineEventRepository();
    missions = new MissionService(missionRepository, validator);
    timeline = new MissionTimelineService(missions, eventRepository, validator);
  }

  @Test
  void createsTimelineEvent() {
    Mission mission = mission();

    MissionTimelineEvent event = timeline.create(mission.id(), createRequest(0, "Coast", TimelineEventType.COAST, true));

    assertEquals(0, event.sequenceIndex());
    assertEquals(TimelineEventType.COAST, event.type());
    assertEquals("Coast", event.name());
    assertTrue(event.enabled());
    assertEquals(List.of(event.id()), timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList());
  }

  @Test
  void updatesTimelineEvent() {
    Mission mission = mission();
    MissionTimelineEvent event = timeline.create(mission.id(), createRequest(0, "Coast", TimelineEventType.COAST, true));

    MissionTimelineEvent updated = timeline.update(mission.id(), event.id(), new UpdateTimelineEventRequest(
        TimelineEventType.VECTOR_BURN,
        "Vector burn placeholder",
        false,
        EVENT_TIME.plusSeconds(60),
        Map.of("frame", "TNW")));

    assertEquals(event.id(), updated.id());
    assertEquals(0, updated.sequenceIndex());
    assertEquals(TimelineEventType.VECTOR_BURN, updated.type());
    assertEquals("Vector burn placeholder", updated.name());
    assertFalse(updated.enabled());
    assertEquals("TNW", updated.parameters().get("frame"));
  }

  @Test
  void deletesTimelineEventAndCompactsSequence() {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.FINITE_BURN, true));

    timeline.delete(mission.id(), first.id());

    List<MissionTimelineEvent> remaining = timeline.list(mission.id());
    assertEquals(1, remaining.size());
    assertEquals(second.id(), remaining.getFirst().id());
    assertEquals(0, remaining.getFirst().sequenceIndex());
  }

  @Test
  void reordersTimelineEvents() {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.IMPULSIVE_BURN, true));
    MissionTimelineEvent third = timeline.create(mission.id(), createRequest(2, "Third", TimelineEventType.VECTOR_BURN, true));

    List<MissionTimelineEvent> reordered = timeline.reorder(mission.id(), List.of(third.id(), first.id(), second.id()));

    assertEquals(List.of(third.id(), first.id(), second.id()), reordered.stream().map(MissionTimelineEvent::id).toList());
    assertEquals(List.of(0, 1, 2), reordered.stream().map(MissionTimelineEvent::sequenceIndex).toList());
  }

  @Test
  void enablesAndDisablesTimelineEvent() {
    Mission mission = mission();
    MissionTimelineEvent event = timeline.create(mission.id(), createRequest(0, "Coast", TimelineEventType.COAST, true));

    assertFalse(timeline.setEnabled(mission.id(), event.id(), false).enabled());
    assertTrue(timeline.setEnabled(mission.id(), event.id(), true).enabled());
  }

  @Test
  void rejectsMissingSequenceIndex() {
    Mission mission = mission();

    IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, () ->
        timeline.create(mission.id(), new CreateTimelineEventRequest(
            null, TimelineEventType.COAST, "Missing sequence", true, EVENT_TIME, Map.of())));

    assertEquals("Timeline event sequence index is required.", exception.getMessage());
  }

  @Test
  void concurrentCreatesRemainContiguousAndUnique() throws Exception {
    Mission mission = mission();

    runConcurrently(8, index -> timeline.create(
        mission.id(),
        createRequest(0, "Create " + index, TimelineEventType.COAST, true)));

    assertContiguousTimeline(timeline.list(mission.id()), 8);
  }

  @Test
  void concurrentReordersLeaveValidTimeline() throws Exception {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.IMPULSIVE_BURN, true));
    MissionTimelineEvent third = timeline.create(mission.id(), createRequest(2, "Third", TimelineEventType.VECTOR_BURN, true));

    runConcurrently(List.of(
        () -> timeline.reorder(mission.id(), List.of(third.id(), second.id(), first.id())),
        () -> timeline.reorder(mission.id(), List.of(second.id(), first.id(), third.id())),
        () -> timeline.reorder(mission.id(), List.of(first.id(), third.id(), second.id()))));

    assertContiguousTimeline(timeline.list(mission.id()), 3);
  }

  @Test
  void concurrentDeletesLeaveValidTimeline() throws Exception {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.IMPULSIVE_BURN, true));
    MissionTimelineEvent third = timeline.create(mission.id(), createRequest(2, "Third", TimelineEventType.VECTOR_BURN, true));
    MissionTimelineEvent fourth = timeline.create(mission.id(), createRequest(3, "Fourth", TimelineEventType.FINITE_BURN, true));

    assertNotEquals(first.id(), fourth.id());
    runConcurrently(List.of(
        () -> {
          timeline.delete(mission.id(), second.id());
          return null;
        },
        () -> {
          timeline.delete(mission.id(), third.id());
          return null;
        }));

    List<MissionTimelineEvent> remaining = timeline.list(mission.id());
    assertEquals(Set.of(first.id(), fourth.id()), new HashSet<>(remaining.stream().map(MissionTimelineEvent::id).toList()));
    assertContiguousTimeline(remaining, 2);
  }

  @Test
  void createRollsBackWhenResequenceFails() {
    Mission mission = mission();
    eventRepository.failNextResequence();

    assertThrows(IllegalStateException.class, () ->
        timeline.create(mission.id(), createRequest(0, "Rollback", TimelineEventType.COAST, true)));

    assertEquals(List.of(), timeline.list(mission.id()));
  }

  @Test
  void reorderRollsBackWhenResequenceFails() {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.IMPULSIVE_BURN, true));
    List<String> originalOrder = timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList();
    eventRepository.failNextResequenceAfterPartialUpdate();

    assertThrows(IllegalStateException.class, () ->
        timeline.reorder(mission.id(), List.of(second.id(), first.id())));

    assertEquals(originalOrder, timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList());
    assertContiguousTimeline(timeline.list(mission.id()), 2);
  }

  @Test
  void deleteRollsBackWhenResequenceFails() {
    Mission mission = mission();
    MissionTimelineEvent first = timeline.create(mission.id(), createRequest(0, "First", TimelineEventType.COAST, true));
    MissionTimelineEvent second = timeline.create(mission.id(), createRequest(1, "Second", TimelineEventType.IMPULSIVE_BURN, true));
    List<String> originalOrder = timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList();
    eventRepository.failNextResequenceAfterPartialUpdate();

    assertThrows(IllegalStateException.class, () -> timeline.delete(mission.id(), first.id()));

    assertEquals(Set.of(first.id(), second.id()), new HashSet<>(timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList()));
    assertEquals(originalOrder, timeline.list(mission.id()).stream().map(MissionTimelineEvent::id).toList());
    assertContiguousTimeline(timeline.list(mission.id()), 2);
  }

  private Mission mission() {
    return missions.create(new CreateMissionRequest("Phase A Test Mission", null, PropagatorType.NUMERICAL, START, END));
  }

  private CreateTimelineEventRequest createRequest(
      int sequenceIndex,
      String name,
      TimelineEventType type,
      boolean enabled) {
    return new CreateTimelineEventRequest(sequenceIndex, type, name, enabled, EVENT_TIME, Map.of());
  }

  private void assertContiguousTimeline(List<MissionTimelineEvent> events, int expectedSize) {
    assertEquals(expectedSize, events.size());
    assertEquals(expectedSize, new HashSet<>(events.stream().map(MissionTimelineEvent::sequenceIndex).toList()).size());
    assertEquals(expectedSize, new HashSet<>(events.stream().map(MissionTimelineEvent::id).toList()).size());
    assertEquals(
        java.util.stream.IntStream.range(0, expectedSize).boxed().toList(),
        events.stream().map(MissionTimelineEvent::sequenceIndex).toList());
  }

  private void runConcurrently(int taskCount, IndexedTask task) throws Exception {
    List<Callable<Object>> tasks = java.util.stream.IntStream.range(0, taskCount)
        .mapToObj(index -> (Callable<Object>) () -> task.run(index))
        .toList();
    runConcurrently(tasks);
  }

  private void runConcurrently(List<Callable<Object>> tasks) throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(tasks.size());
    CountDownLatch start = new CountDownLatch(1);
    try {
      List<Future<Object>> futures = tasks.stream()
          .map(task -> executor.submit(() -> {
            assertTrue(start.await(5, TimeUnit.SECONDS));
            return task.call();
          }))
          .toList();
      start.countDown();
      for (Future<Object> future : futures) {
        future.get(5, TimeUnit.SECONDS);
      }
    } finally {
      executor.shutdownNow();
    }
  }

  @FunctionalInterface
  private interface IndexedTask {
    Object run(int index);
  }

  private static class InMemoryMissionRepository extends MissionRepository {
    private final Map<String, Mission> missions = new LinkedHashMap<>();

    InMemoryMissionRepository() {
      super(null);
    }

    @Override
    public Mission save(Mission mission) {
      missions.put(mission.id(), mission);
      return mission;
    }

    @Override
    public Optional<Mission> findById(String id) {
      return Optional.ofNullable(missions.get(id));
    }

    @Override
    public Optional<Mission> lockById(String id) {
      return findById(id);
    }

    @Override
    public List<Mission> findAll() {
      return List.copyOf(missions.values());
    }
  }

  private static class InMemoryTimelineEventRepository extends MissionTimelineEventRepository {
    private final Map<String, MissionTimelineEvent> events = new LinkedHashMap<>();
    private boolean failNextResequence;
    private boolean failNextResequenceAfterPartialUpdate;

    InMemoryTimelineEventRepository() {
      super(null, null);
    }

    @Override
    public MissionTimelineEvent save(MissionTimelineEvent event) {
      events.put(event.id(), event);
      return event;
    }

    @Override
    public Optional<MissionTimelineEvent> findById(String missionId, String eventId) {
      MissionTimelineEvent event = events.get(eventId);
      return event != null && event.missionId().equals(missionId) ? Optional.of(event) : Optional.empty();
    }

    @Override
    public List<MissionTimelineEvent> findByMissionId(String missionId) {
      return events.values().stream()
          .filter(event -> event.missionId().equals(missionId))
          .sorted(Comparator.comparingInt(MissionTimelineEvent::sequenceIndex))
          .toList();
    }

    @Override
    public void resequence(String missionId, List<String> eventIds) {
      if (failNextResequence) {
        failNextResequence = false;
        throw new IllegalStateException("Simulated resequence failure");
      }
      for (int index = 0; index < eventIds.size(); index++) {
        MissionTimelineEvent event = events.get(eventIds.get(index));
        events.put(event.id(), new MissionTimelineEvent(
            event.id(),
            event.missionId(),
            index,
            event.type(),
            event.name(),
            event.enabled(),
            event.executionTime(),
            event.parameters(),
            event.createdAt(),
            Instant.now()));
        if (failNextResequenceAfterPartialUpdate) {
          failNextResequenceAfterPartialUpdate = false;
          throw new IllegalStateException("Simulated partial resequence failure");
        }
      }
    }

    @Override
    public void delete(String missionId, String eventId) {
      MissionTimelineEvent event = events.get(eventId);
      if (event != null && event.missionId().equals(missionId)) {
        events.remove(eventId);
      }
    }

    void failNextResequence() {
      failNextResequence = true;
    }

    void failNextResequenceAfterPartialUpdate() {
      failNextResequenceAfterPartialUpdate = true;
    }
  }
}
