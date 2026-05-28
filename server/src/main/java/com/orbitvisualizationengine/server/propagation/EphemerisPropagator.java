package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class EphemerisPropagator implements OrbitPropagator {
  @Override
  public String name() {
    return "SERVER_EPHEMERIS";
  }

  @Override
  public EphemerisState propagate(PropagationContext context, Instant date) {
    throw new UnsupportedOperationException(
        "Ephemeris propagation requires an explicit ephemeris sample set. Use interpolate(samples, date).");
  }

  public EphemerisState interpolate(List<EphemerisState> samples, Instant date) {
    if (samples.isEmpty()) {
      throw new IllegalArgumentException("Ephemeris propagation requires at least one sample");
    }
    if (samples.size() == 1) {
      return samples.getFirst();
    }

    List<EphemerisState> ordered = samples.stream()
        .sorted(Comparator.comparing(EphemerisState::time))
        .toList();
    EphemerisState before = ordered.getFirst();
    EphemerisState after = ordered.getLast();
    for (int index = 0; index < ordered.size() - 1; index++) {
      EphemerisState a = ordered.get(index);
      EphemerisState b = ordered.get(index + 1);
      if (!date.isBefore(a.time()) && !date.isAfter(b.time())) {
        before = a;
        after = b;
        break;
      }
    }

    double total = Math.max(1.0, Duration.between(before.time(), after.time()).toMillis());
    double alpha = Math.min(1.0, Math.max(0.0, Duration.between(before.time(), date).toMillis() / total));
    return new EphemerisState(
        date,
        before.frame(),
        lerp(before.positionKm(), after.positionKm(), alpha),
        lerp(before.velocityKmps(), after.velocityKmps(), alpha),
        lerp(before.latitudeDeg(), after.latitudeDeg(), alpha),
        lerp(before.longitudeDeg(), after.longitudeDeg(), alpha),
        lerp(before.altitudeKm(), after.altitudeKm(), alpha));
  }

  @Override
  public PropagationCapabilities capabilities() {
    return new PropagationCapabilities(false, false, false, false);
  }

  private double[] lerp(double[] a, double[] b, double alpha) {
    return new double[] {
        a[0] + (b[0] - a[0]) * alpha,
        a[1] + (b[1] - a[1]) * alpha,
        a[2] + (b[2] - a[2]) * alpha};
  }

  private Double lerp(Double a, Double b, double alpha) {
    if (a == null || b == null) {
      return null;
    }
    return a + (b - a) * alpha;
  }
}
