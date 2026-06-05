package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceContribution;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceDiagnosticsSample;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.hipparchus.ode.AbstractIntegrator;
import org.hipparchus.ode.nonstiff.AdamsBashforthIntegrator;
import org.hipparchus.ode.nonstiff.AdamsMoultonIntegrator;
import org.hipparchus.ode.nonstiff.ClassicalRungeKuttaIntegrator;
import org.hipparchus.ode.nonstiff.DormandPrince54Integrator;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.hipparchus.ode.nonstiff.GillIntegrator;
import org.hipparchus.ode.nonstiff.GraggBulirschStoerIntegrator;
import org.hipparchus.ode.nonstiff.LutherIntegrator;
import org.hipparchus.ode.nonstiff.MidpointIntegrator;
import org.hipparchus.ode.nonstiff.ThreeEighthesIntegrator;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.forces.ForceModel;
import org.orekit.forces.drag.DragForce;
import org.orekit.forces.drag.IsotropicDrag;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.ThirdBodyAttraction;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.radiation.IsotropicRadiationSingleCoefficient;
import org.orekit.forces.radiation.SolarRadiationPressure;
import org.orekit.frames.Frame;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.OrbitType;
import org.orekit.orbits.PositionAngleType;
import org.orekit.propagation.BoundedPropagator;
import org.orekit.propagation.EphemerisGenerator;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;
import org.orekit.utils.ParameterDriver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class NumericalPropagator implements OrbitPropagator {
  private static final PropagationCapabilities CAPABILITIES =
      new PropagationCapabilities(true, true, true, true);

  private final OrekitEnvironment orekit;
  private final OrekitManeuverFactory maneuverFactory;
  private final LegacyManeuverCommandAdapter legacyManeuverCommandAdapter;

  public NumericalPropagator(OrekitEnvironment orekit) {
    this(orekit, new OrekitManeuverFactory(orekit), new LegacyManeuverCommandAdapter());
  }

  @Autowired
  public NumericalPropagator(
      OrekitEnvironment orekit,
      OrekitManeuverFactory maneuverFactory,
      LegacyManeuverCommandAdapter legacyManeuverCommandAdapter) {
    this.orekit = orekit;
    this.maneuverFactory = maneuverFactory;
    this.legacyManeuverCommandAdapter = legacyManeuverCommandAdapter;
  }

  @Override
  public String name() {
    return "OREKIT_NUMERICAL";
  }

  @Override
  public EphemerisState propagate(PropagationContext context, Instant date) {
    return OrekitStateMapper.propagateToState(
        buildPropagator(context),
        date,
        orekit.itrf(),
        orekit.earth(),
        "ITRF");
  }

  @Override
  public List<EphemerisState> trajectory(
      PropagationContext context,
      Instant start,
      Instant end,
      int stepSeconds) {
    if (start.isAfter(end)) {
      return List.of();
    }
    if (stepSeconds <= 0) {
      throw new IllegalArgumentException("Trajectory stepSeconds must be greater than zero.");
    }

    org.orekit.propagation.numerical.NumericalPropagator propagator = buildPropagator(context);
    AbsoluteDate startDate = OrekitStateMapper.toAbsoluteDate(start);
    AbsoluteDate endDate = OrekitStateMapper.toAbsoluteDate(end);
    EphemerisGenerator generator = propagator.getEphemerisGenerator();

    propagator.propagate(startDate, endDate);
    BoundedPropagator ephemeris = generator.getGeneratedEphemeris();

    List<EphemerisState> states = new ArrayList<>();
    ephemeris.clearStepHandlers();
    ephemeris.setStepHandler(
        stepSeconds,
        state -> states.add(OrekitStateMapper.spacecraftStateToEphemerisState(
            state,
            orekit.itrf(),
            orekit.earth(),
            "ITRF")));
    ephemeris.propagate(startDate, endDate);
    return states;
  }

  @Override
  public PropagationCapabilities capabilities() {
    return CAPABILITIES;
  }

  public org.orekit.propagation.numerical.NumericalPropagator buildPropagator(PropagationContext context) {
    Orbit initialOrbit = initialOrbit(context);
    SpacecraftState initialState = new SpacecraftState(initialOrbit, context.spacecraft().wetMassKg());

    NumericalIntegratorSettings settings = context.integratorSettings();
    AbstractIntegrator integrator = buildIntegrator(settings);
    org.orekit.propagation.numerical.NumericalPropagator propagator =
        new org.orekit.propagation.numerical.NumericalPropagator(integrator);
    propagator.setOrbitType(OrbitType.CARTESIAN);
    propagator.setPositionAngleType(PositionAngleType.TRUE);
    propagator.setMu(Constants.EGM96_EARTH_MU);
    propagator.setInitialState(initialState);

    forceModels(context).forEach(propagator::addForceModel);
    return propagator;
  }

  private AbstractIntegrator buildIntegrator(NumericalIntegratorSettings settings) {
    double fixedStep = settings.maxStep();
    return switch (settings.type()) {
      case DORMAND_PRINCE_853 -> new DormandPrince853Integrator(
          settings.minStep(), settings.maxStep(), settings.absTolerance(), settings.relTolerance());
      case DORMAND_PRINCE_54 -> new DormandPrince54Integrator(
          settings.minStep(), settings.maxStep(), settings.absTolerance(), settings.relTolerance());
      case CLASSICAL_RUNGE_KUTTA -> new ClassicalRungeKuttaIntegrator(fixedStep);
      case GILL -> new GillIntegrator(fixedStep);
      case LUTHER -> new LutherIntegrator(fixedStep);
      case MIDPOINT -> new MidpointIntegrator(fixedStep);
      case THREE_EIGHTHES -> new ThreeEighthesIntegrator(fixedStep);
      case ADAMS_BASHFORTH -> new AdamsBashforthIntegrator(
          4, settings.minStep(), settings.maxStep(), settings.absTolerance(), settings.relTolerance());
      case ADAMS_MOULTON -> new AdamsMoultonIntegrator(
          4, settings.minStep(), settings.maxStep(), settings.absTolerance(), settings.relTolerance());
      case GRAGG_BULIRSCH_STOER -> new GraggBulirschStoerIntegrator(
          settings.minStep(), settings.maxStep(), settings.absTolerance(), settings.relTolerance());
    };
  }

  private Orbit initialOrbit(PropagationContext context) {
    if (context.initialOrbit() != null) {
      return context.initialOrbit();
    }
    Frame inertial = orekit.eme2000();
    TLEPropagator seedPropagator = TLEPropagator.selectExtrapolator(context.tle());
    AbsoluteDate epoch = context.tle().getDate();
    PVCoordinates seedPv = seedPropagator.getPVCoordinates(epoch, inertial);
    return new CartesianOrbit(seedPv, inertial, epoch, Constants.EGM96_EARTH_MU);
  }

  public List<ForceModel> forceModels(PropagationContext context) {
    List<ForceModel> models = new ArrayList<>();
    var config = context.analysisConfig();
    SpacecraftModel spacecraft = context.spacecraft();

    if (config.gravityEnabled()) {
      int degree = Math.max(2, config.gravityDegree());
      int order = Math.max(0, Math.min(config.gravityOrder(), degree));
      addRequired(models, "gravity harmonics", () -> new HolmesFeatherstoneAttractionModel(
          orekit.itrf(),
          GravityFieldFactory.getNormalizedProvider(degree, order)));
    }

    if (config.dragEnabled()) {
      addRequired(models, "atmospheric drag / CSSI space weather", () -> new DragForce(
          new NRLMSISE00(
              new CssiSpaceWeatherData(CssiSpaceWeatherData.DEFAULT_SUPPORTED_NAMES),
              CelestialBodyFactory.getSun(),
              orekit.earth()),
          new IsotropicDrag(spacecraft.dragAreaM2(), spacecraft.dragCoefficient())));
    }

    if (config.thirdBodySunEnabled()) {
      addRequired(models, "Sun third-body ephemerides", () -> new ThirdBodyAttraction(CelestialBodyFactory.getSun()));
    }

    if (config.thirdBodyMoonEnabled()) {
      addRequired(models, "Moon third-body ephemerides", () -> new ThirdBodyAttraction(CelestialBodyFactory.getMoon()));
    }

    if (config.solarRadiationPressureEnabled()) {
      addRequired(models, "solar radiation pressure ephemerides", () -> new SolarRadiationPressure(
          CelestialBodyFactory.getSun(),
          orekit.earth(),
          new IsotropicRadiationSingleCoefficient(
              spacecraft.srpAreaM2(),
              spacecraft.reflectivityCoefficient())));
    }

    if (config.maneuverModelEnabled()) {
      context.maneuvers().stream()
          .filter(maneuver -> maneuver.durationSec() > 0)
          .map(maneuver -> legacyManeuverCommandAdapter.fromLegacy(maneuver, context.spacecraft()))
          .map(maneuverFactory::constantThrust)
          .forEach(models::add);
      context.maneuverCommands().stream()
          .filter(PropagationManeuverCommand::enabled)
          .filter(command -> command.durationSeconds() > 0)
          .map(maneuverFactory::constantThrust)
          .forEach(models::add);
    }

    return models;
  }

  public ForceDiagnosticsSample diagnosticsAt(PropagationContext context, Instant instant) {
    org.orekit.propagation.numerical.NumericalPropagator propagator = buildPropagator(context);
    AbsoluteDate date = OrekitStateMapper.toAbsoluteDate(instant);
    SpacecraftState state = propagator.propagate(date);
    Vector3D centralGravity = state.getPosition().normalize()
        .scalarMultiply(-Constants.EGM96_EARTH_MU / state.getPosition().getNormSq());

    List<NamedAcceleration> accelerations = new ArrayList<>();
    accelerations.add(new NamedAcceleration("central-gravity", centralGravity));

    for (ForceModel model : forceModels(context)) {
      double[] parameters = model.getParametersDrivers().stream()
          .mapToDouble(ParameterDriver::getValue)
          .toArray();
      accelerations.add(new NamedAcceleration(modelName(model), model.acceleration(state, parameters)));
    }

    Vector3D total = accelerations.stream()
        .map(NamedAcceleration::acceleration)
        .reduce(Vector3D.ZERO, Vector3D::add);
    double totalNorm = total.getNorm();
    List<ForceContribution> contributions = accelerations.stream()
        .map(item -> new ForceContribution(
            item.name(),
            new double[] {
                item.acceleration().getX(),
                item.acceleration().getY(),
                item.acceleration().getZ()},
            item.acceleration().getNorm(),
            totalNorm == 0.0 ? 0.0 : item.acceleration().getNorm() * 100.0 / totalNorm,
            state.getFrame().getName()))
        .toList();

    return new ForceDiagnosticsSample(
        instant,
        state.getFrame().getName(),
        new double[] {total.getX(), total.getY(), total.getZ()},
        totalNorm,
        contributions);
  }

  private void addRequired(List<ForceModel> models, String label, Supplier<ForceModel> supplier) {
    try {
      models.add(supplier.get());
    } catch (RuntimeException exception) {
      throw new IllegalStateException("Enabled Orekit force model could not be activated: " + label, exception);
    }
  }

  private String modelName(ForceModel model) {
    String simpleName = model.getClass().getSimpleName();
    return simpleName == null || simpleName.isBlank() ? model.getClass().getName() : simpleName;
  }

  private record NamedAcceleration(String name, Vector3D acceleration) {
  }
}
