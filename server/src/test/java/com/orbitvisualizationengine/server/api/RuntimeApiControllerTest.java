package com.orbitvisualizationengine.server.api;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.orbitvisualizationengine.server.catalog.runtime.CatalogSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ClosestApproach;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.ConjunctionStatus;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogConjunctionService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.CatalogScreeningStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.catalog.ScreeningExecutionStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityMethod;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityService;
import com.orbitvisualizationengine.server.catalog.runtime.conjunction.collision.CollisionProbabilityStatistics;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceMatrix;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationRequest;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovariancePropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.covariance.CovarianceState;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseRequest;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseResult;
import com.orbitvisualizationengine.server.catalog.runtime.eclipse.EclipseService;
import com.orbitvisualizationengine.server.catalog.runtime.exception.CatalogSatelliteNotFoundException;
import com.orbitvisualizationengine.server.catalog.runtime.groundstation.GroundStationId;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatellite;
import com.orbitvisualizationengine.server.catalog.runtime.orekit.RuntimeSatelliteService;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.CartesianVector;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagatedState;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationResult;
import com.orbitvisualizationengine.server.catalog.runtime.propagation.PropagationService;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeFrame;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionRequest;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionResult;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeMotionService;
import com.orbitvisualizationengine.server.catalog.runtime.relativemotion.RelativeState;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityRequest;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityResult;
import com.orbitvisualizationengine.server.catalog.runtime.visibility.VisibilityService;
import com.orbitvisualizationengine.server.validation.OrekitTestDataLoader;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.orekit.propagation.analytical.tle.TLE;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

class RuntimeApiControllerTest {
  private static final Instant START = Instant.parse("2026-07-07T00:00:00Z");
  private static final Instant STOP = Instant.parse("2026-07-07T00:10:00Z");
  private static final Duration STEP = Duration.ofSeconds(60);

  private MockMvc mvc;
  private ObjectMapper objectMapper;
  private FakeRuntimeSatelliteService runtimeSatelliteService;
  private FakePropagationService propagationService;
  private FakeVisibilityService visibilityService;
  private FakeEclipseService eclipseService;
  private FakeRelativeMotionService relativeMotionService;
  private FakeConjunctionService conjunctionService;
  private FakeCatalogConjunctionService catalogConjunctionService;
  private FakeCollisionProbabilityService collisionProbabilityService;
  private FakeCovariancePropagationService covariancePropagationService;

  @BeforeEach
  void setUp() {
    objectMapper = new ObjectMapper()
        .findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    runtimeSatelliteService = new FakeRuntimeSatelliteService();
    propagationService = new FakePropagationService();
    visibilityService = new FakeVisibilityService();
    eclipseService = new FakeEclipseService();
    relativeMotionService = new FakeRelativeMotionService();
    conjunctionService = new FakeConjunctionService();
    catalogConjunctionService = new FakeCatalogConjunctionService();
    collisionProbabilityService = new FakeCollisionProbabilityService();
    covariancePropagationService = new FakeCovariancePropagationService();

    LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
    validator.afterPropertiesSet();

    mvc = MockMvcBuilders.standaloneSetup(
            new RuntimeSatelliteController(runtimeSatelliteService),
            new RuntimePropagationController(runtimeSatelliteService, propagationService),
            new VisibilityController(visibilityService),
            new EclipseController(eclipseService),
            new RelativeMotionController(relativeMotionService),
            new RuntimeConjunctionController(conjunctionService),
            new CatalogScreeningController(catalogConjunctionService),
            new CollisionProbabilityController(collisionProbabilityService),
            new CovariancePropagationController(covariancePropagationService))
        .setControllerAdvice(new ApiExceptionHandler())
        .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
        .setValidator(validator)
        .build();
  }

  @Test
  void runtimeSatelliteReturnsSatellite() throws Exception {
    runtimeSatelliteService.result = runtimeSatellite();

    mvc.perform(get("/api/runtime/satellites/25544"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.catalogSatellite.noradCatalogId").value(25544));
  }

  @Test
  void runtimeSatelliteReturnsNotFound() throws Exception {
    runtimeSatelliteService.notFound = true;

    mvc.perform(get("/api/runtime/satellites/999999"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error", containsString("No published catalog satellite exists")));
  }

  @Test
  void runtimeSatelliteRejectsInvalidNorad() throws Exception {
    runtimeSatelliteService.invalidNorad = true;

    mvc.perform(get("/api/runtime/satellites/0"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("NORAD catalog id must be positive"));
  }

  @Test
  void runtimePropagationReturnsPropagationResult() throws Exception {
    RuntimeSatellite satellite = runtimeSatellite();
    RuntimePropagationRequest request = new RuntimePropagationRequest(25544, START, STOP, 60, null);
    runtimeSatelliteService.result = satellite;
    propagationService.result = propagationResult(satellite);

    mvc.perform(post("/api/runtime/propagation")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.states[0].frameName").value("EME2000"));
  }

  @Test
  void runtimePropagationRejectsInvalidBeanValidationRequest() throws Exception {
    String request = """
        {
          "noradCatalogId": 25544,
          "start": "2026-07-07T00:00:00Z",
          "end": "2026-07-07T00:10:00Z",
          "stepSeconds": 1
        }
        """;

    mvc.perform(post("/api/runtime/propagation")
            .contentType(MediaType.APPLICATION_JSON)
            .content(request))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error", containsString("Request validation failed")));
  }

  @Test
  void runtimePropagationReturnsNotFoundForMissingSatellite() throws Exception {
    runtimeSatelliteService.notFound = true;
    RuntimePropagationRequest request = new RuntimePropagationRequest(999999, START, STOP, 60, null);

    mvc.perform(post("/api/runtime/propagation")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error", containsString("No published catalog satellite exists")));
  }

  @Test
  void visibilityReturnsVisibilityResult() throws Exception {
    VisibilityRequest request = visibilityRequest();
    visibilityService.result = new VisibilityResult(request, List.of());

    mvc.perform(post("/api/runtime/visibility")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.request.noradCatalogId").value(25544));
  }

  @Test
  void visibilityRejectsInvalidRuntimeRequest() throws Exception {
    String request = """
        {
          "noradCatalogId": 0,
          "groundStationId": {"value": "GS-1"},
          "startTime": "2026-07-07T00:00:00Z",
          "stopTime": "2026-07-07T00:10:00Z",
          "step": "PT60S",
          "minimumElevationDegrees": 10.0
        }
        """;

    mvc.perform(post("/api/runtime/visibility")
            .contentType(MediaType.APPLICATION_JSON)
            .content(request))
        .andExpect(status().isBadRequest());
  }

  @Test
  void eclipseReturnsEclipseResult() throws Exception {
    EclipseRequest request = eclipseRequest();
    eclipseService.result = new EclipseResult(request, List.of());

    mvc.perform(post("/api/runtime/eclipse")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.request.noradCatalogId").value(25544));
  }

  @Test
  void eclipseRuntimeExceptionReturnsServerError() throws Exception {
    eclipseService.runtimeFailure = true;

    mvc.perform(post("/api/runtime/eclipse")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(eclipseRequest())))
        .andExpect(status().isInternalServerError());
  }

  @Test
  void relativeMotionReturnsRelativeMotionResult() throws Exception {
    RelativeMotionRequest request = relativeMotionRequest();
    relativeMotionService.result = new RelativeMotionResult(request, List.of(relativeState()));

    mvc.perform(post("/api/runtime/relative-motion")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.states[0].frame").value("LVLH_RTN"));
  }

  @Test
  void pairwiseConjunctionReturnsConjunctionResult() throws Exception {
    ConjunctionRequest request = conjunctionRequest();
    conjunctionService.result = conjunctionResult();

    mvc.perform(post("/api/runtime/conjunctions/pairwise")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CLEAR"));
  }

  @Test
  void catalogScreeningReturnsCatalogConjunctionResult() throws Exception {
    CatalogConjunctionRequest request = catalogConjunctionRequest();
    CatalogScreeningStatistics statistics = new CatalogScreeningStatistics(1, 1, 0, 0, 0);
    catalogConjunctionService.result = new CatalogConjunctionResult(
        request,
        catalogSatellite(),
        List.of(),
        statistics,
        new ScreeningExecutionStatistics(0, 0, 0));

    mvc.perform(post("/api/runtime/conjunctions/catalog-screening")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.primarySatellite.noradCatalogId").value(25544));
  }

  @Test
  void collisionProbabilityReturnsCollisionProbabilityResult() throws Exception {
    CollisionProbabilityRequest request = collisionProbabilityRequest();
    collisionProbabilityService.result = new CollisionProbabilityResult(
        request,
        0.001,
        new CollisionProbabilityStatistics(
            CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE,
            4.0,
            2.0,
            0.5,
            0.1));

    mvc.perform(post("/api/runtime/collision-probability")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.probabilityOfCollision").value(0.001));
  }

  @Test
  void covariancePropagationReturnsCovariancePropagationResult() throws Exception {
    CovariancePropagationRequest request = covariancePropagationRequest();
    covariancePropagationService.result = new CovariancePropagationResult(
        request,
        runtimeSatellite(),
        List.of(new CovarianceState(START, covariance(6))));

    mvc.perform(post("/api/runtime/covariance/propagate")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.states[0].covarianceMatrix.values[0][0]").value(1.0));
  }

  private String json(Object value) throws Exception {
    return objectMapper.writeValueAsString(value);
  }

  private static RuntimeSatellite runtimeSatellite() {
    OrekitTestDataLoader.ensureLoaded();
    return new RuntimeSatellite(catalogSatellite(), new TLE(
        "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554"));
  }

  private static CatalogSatellite catalogSatellite() {
    return new CatalogSatellite(
        25544,
        1,
        10,
        "celestrak",
        "CelesTrak",
        "ISS",
        "1998-067A",
        "PAYLOAD",
        "U",
        "US",
        1998,
        67,
        "A",
        START,
        "1 25544U 98067A   26128.19937109  .00004920  00000+0  96926-4 0  9998",
        "2 25544  51.6308 138.0417 0007476  35.9089 324.2400 15.49139257565554",
        "sha256",
        999,
        0,
        BigDecimal.valueOf(51.6308),
        BigDecimal.valueOf(138.0417),
        BigDecimal.valueOf(0.0007476),
        BigDecimal.valueOf(35.9089),
        BigDecimal.valueOf(324.2400),
        BigDecimal.valueOf(15.49139257),
        BigDecimal.valueOf(0.00004920),
        BigDecimal.ZERO,
        BigDecimal.valueOf(0.000096926),
        56555,
        1,
        1,
        START,
        START);
  }

  private static PropagationResult propagationResult(RuntimeSatellite satellite) {
    return new PropagationResult(
        satellite,
        START,
        STOP,
        STEP,
        List.of(new PropagatedState(
            START,
            "EME2000",
            new CartesianVector(1.0, 2.0, 3.0),
            new CartesianVector(4.0, 5.0, 6.0))));
  }

  private static VisibilityRequest visibilityRequest() {
    return new VisibilityRequest(
        25544,
        new GroundStationId("GS-1"),
        START,
        STOP,
        STEP,
        10.0);
  }

  private static EclipseRequest eclipseRequest() {
    return new EclipseRequest(25544, START, STOP, STEP);
  }

  private static RelativeMotionRequest relativeMotionRequest() {
    return new RelativeMotionRequest(25544, 40967, START, STOP, STEP, RelativeFrame.LVLH_RTN);
  }

  private static RelativeState relativeState() {
    return new RelativeState(
        START,
        RelativeFrame.LVLH_RTN,
        new CartesianVector(10.0, 20.0, 30.0),
        new CartesianVector(0.1, 0.2, 0.3));
  }

  private static ConjunctionRequest conjunctionRequest() {
    return new ConjunctionRequest(25544, 40967, START, STOP, STEP, RelativeFrame.LVLH_RTN, 1000.0);
  }

  private static ConjunctionResult conjunctionResult() {
    return new ConjunctionResult(
        conjunctionRequest(),
        new ClosestApproach(START, 500.0, 120.0, relativeState()),
        ConjunctionStatus.CLEAR);
  }

  private static CatalogConjunctionRequest catalogConjunctionRequest() {
    return new CatalogConjunctionRequest(25544, START, STOP, STEP, RelativeFrame.LVLH_RTN, 1000.0);
  }

  private static CollisionProbabilityRequest collisionProbabilityRequest() {
    return new CollisionProbabilityRequest(
        conjunctionResult(),
        covarianceValues(3),
        covarianceValues(3),
        2.0,
        CollisionProbabilityMethod.ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE);
  }

  private static CovariancePropagationRequest covariancePropagationRequest() {
    return new CovariancePropagationRequest(25544, START, STOP, STEP, covariance(6));
  }

  private static CovarianceMatrix covariance(int dimension) {
    return new CovarianceMatrix(covarianceValues(dimension));
  }

  private static List<List<Double>> covarianceValues(int dimension) {
    return java.util.stream.IntStream.range(0, dimension)
        .mapToObj(row -> java.util.stream.IntStream.range(0, dimension)
            .mapToObj(column -> row == column ? 1.0 : 0.0)
            .toList())
        .toList();
  }

  private static final class FakeRuntimeSatelliteService extends RuntimeSatelliteService {
    private RuntimeSatellite result = runtimeSatellite();
    private boolean notFound;
    private boolean invalidNorad;

    private FakeRuntimeSatelliteService() {
      super(null, null);
    }

    @Override
    public RuntimeSatellite findByNoradId(int noradCatalogId) {
      if (invalidNorad) {
        throw new IllegalArgumentException("NORAD catalog id must be positive");
      }
      if (notFound) {
        throw new CatalogSatelliteNotFoundException(noradCatalogId);
      }
      return result;
    }
  }

  private static final class FakePropagationService extends PropagationService {
    private PropagationResult result = propagationResult(runtimeSatellite());

    private FakePropagationService() {
      super(null);
    }

    @Override
    public PropagationResult propagate(
        RuntimeSatellite satellite,
        Instant startTime,
        Instant stopTime,
        Duration step) {
      return result;
    }
  }

  private static final class FakeVisibilityService extends VisibilityService {
    private VisibilityResult result = new VisibilityResult(visibilityRequest(), List.of());

    private FakeVisibilityService() {
      super(null, null, null, null);
    }

    @Override
    public VisibilityResult computeVisibility(VisibilityRequest request) {
      return result;
    }
  }

  private static final class FakeEclipseService extends EclipseService {
    private EclipseResult result = new EclipseResult(eclipseRequest(), List.of());
    private boolean runtimeFailure;

    private FakeEclipseService() {
      super(null, null, null);
    }

    @Override
    public EclipseResult computeEclipses(EclipseRequest request) {
      if (runtimeFailure) {
        throw new RuntimeException("Unexpected runtime failure");
      }
      return result;
    }
  }

  private static final class FakeRelativeMotionService extends RelativeMotionService {
    private RelativeMotionResult result = new RelativeMotionResult(
        relativeMotionRequest(),
        List.of(relativeState()));

    private FakeRelativeMotionService() {
      super(null, null, null);
    }

    @Override
    public RelativeMotionResult computeRelativeMotion(RelativeMotionRequest request) {
      return result;
    }
  }

  private static final class FakeConjunctionService extends ConjunctionService {
    private ConjunctionResult result = conjunctionResult();

    private FakeConjunctionService() {
      super(null, null, null, null);
    }

    @Override
    public ConjunctionResult analyze(ConjunctionRequest request) {
      return result;
    }
  }

  private static final class FakeCatalogConjunctionService extends CatalogConjunctionService {
    private CatalogConjunctionResult result;

    private FakeCatalogConjunctionService() {
      super(null, null, null);
    }

    @Override
    public CatalogConjunctionResult screen(CatalogConjunctionRequest request) {
      return result;
    }
  }

  private static final class FakeCollisionProbabilityService extends CollisionProbabilityService {
    private CollisionProbabilityResult result;

    private FakeCollisionProbabilityService() {
      super(null);
    }

    @Override
    public CollisionProbabilityResult compute(CollisionProbabilityRequest request) {
      return result;
    }
  }

  private static final class FakeCovariancePropagationService extends CovariancePropagationService {
    private CovariancePropagationResult result;

    private FakeCovariancePropagationService() {
      super(null, null);
    }

    @Override
    public CovariancePropagationResult propagate(CovariancePropagationRequest request) {
      return result;
    }
  }
}
