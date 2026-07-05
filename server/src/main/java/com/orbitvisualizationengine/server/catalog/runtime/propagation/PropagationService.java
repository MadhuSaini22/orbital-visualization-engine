package com.orbitvisualizationengine.server.catalog.runtime.propagation;

import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class PropagationService {
  private final PropagationEngine propagationEngine;

  public PropagationService(PropagationEngine propagationEngine) {
    this.propagationEngine = propagationEngine;
  }

  public PropagationResult propagate(
      RuntimeSatellite satellite,
      Instant startTime,
      Instant stopTime,
      Duration step) {
    validate(satellite, startTime, stopTime, step);

    List<Instant> sampleTimes = sampleTimes(startTime, stopTime, step);
    List<PropagatedState> states = propagationEngine.propagate(satellite, sampleTimes);

    return new PropagationResult(satellite, startTime, stopTime, step, states);
  }

  private static void validate(
      RuntimeSatellite satellite,
      Instant startTime,
      Instant stopTime,
      Duration step) {
    if (satellite == null) {
      throw new PropagationRequestException("Runtime satellite is required");
    }
    if (startTime == null) {
      throw new PropagationRequestException("Start time is required");
    }
    if (stopTime == null) {
      throw new PropagationRequestException("Stop time is required");
    }
    if (step == null) {
      throw new PropagationRequestException("Step duration is required");
    }
    if (stopTime.isBefore(startTime)) {
      throw new PropagationRequestException("Stop time must be greater than or equal to start time");
    }
    if (step.isZero() || step.isNegative()) {
      throw new PropagationRequestException("Step duration must be positive");
    }
  }

  private static List<Instant> sampleTimes(Instant startTime, Instant stopTime, Duration step) {
    List<Instant> samples = new ArrayList<>();
    Instant cursor = startTime;
    while (cursor.isBefore(stopTime)) {
      samples.add(cursor);
      Instant next = cursor.plus(step);
      if (!next.isAfter(cursor)) {
        throw new PropagationRequestException("Step duration does not advance the propagation time");
      }
      cursor = next.isAfter(stopTime) ? stopTime : next;
    }
    samples.add(stopTime);
    return List.copyOf(samples);
  }
}
