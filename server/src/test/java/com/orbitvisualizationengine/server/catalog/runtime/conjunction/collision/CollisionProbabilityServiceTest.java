package com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CollisionProbabilityServiceTest {
  @Test
  void validatesAndDelegatesToEngine() {
    RecordingCollisionProbabilityEngine engine = new RecordingCollisionProbabilityEngine();
    CollisionProbabilityService service = new CollisionProbabilityService(engine);
    CollisionProbabilityRequest request = CollisionProbabilityModelTest.request(20.0, 2.0);

    CollisionProbabilityResult result = service.compute(request);

    assertThat(engine.request).isSameAs(request);
    assertThat(result.request()).isSameAs(request);
    assertThat(result.probabilityOfCollision()).isEqualTo(0.25);
  }

  @Test
  void rejectsNullRequest() {
    CollisionProbabilityService service = new CollisionProbabilityService(new RecordingCollisionProbabilityEngine());

    assertThatThrownBy(() -> service.compute(null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Collision probability request is required");
  }

  private static final class RecordingCollisionProbabilityEngine implements CollisionProbabilityEngine {
    private CollisionProbabilityRequest request;

    @Override
    public CollisionProbabilityResult compute(CollisionProbabilityRequest request) {
      this.request = request;
      return new CollisionProbabilityResult(
          request,
          0.25,
          new CollisionProbabilityStatistics(
              request.method(),
              100.0,
              10.0,
              2.0,
              0.2));
    }
  }
}
