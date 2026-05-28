package com.orbitvisualizationengine.server.propagation;

import com.orbitvisualizationengine.server.domain.EphemerisState;
import com.orbitvisualizationengine.server.domain.ManeuverEvent;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceContribution;
import com.orbitvisualizationengine.server.dto.diagnostics.ForceDiagnosticsSample;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.orekit.attitudes.AttitudeProvider;
import org.orekit.attitudes.LofOffset;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.forces.ForceModel;
import org.orekit.forces.drag.DragForce;
import org.orekit.forces.drag.IsotropicDrag;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.ThirdBodyAttraction;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.maneuvers.ConstantThrustManeuver;
import org.orekit.forces.radiation.IsotropicRadiationSingleCoefficient;
import org.orekit.forces.radiation.SolarRadiationPressure;
import org.orekit.frames.Frame;
import org.orekit.frames.LOFType;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.Orbit;
import org.orekit.orbits.OrbitType;
import org.orekit.orbits.PositionAngleType;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.analytical.tle.TLEPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.Constants;
import org.orekit.utils.PVCoordinates;
import org.orekit.utils.ParameterDriver;
import org.springframework.stereotype.Component;

@Component
public class NumericalPropagator implements OrbitPropagator {
  private static final PropagationCapabilities CAPABILITIES =
      new PropagationCapabilities(true, true, true, true);

  private final OrekitEnvironment orekit;

  public NumericalPropagator(OrekitEnvironment orekit) {
    this.orekit = orekit;
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
  public PropagationCapabilities capabilities() {
    return CAPABILITIES;
  }

  public org.orekit.propagation.numerical.NumericalPropagator buildPropagator(PropagationContext context) {
    Frame inertial = orekit.eme2000();
    TLEPropagator seedPropagator = TLEPropagator.selectExtrapolator(context.tle());
    AbsoluteDate epoch = context.tle().getDate();
    PVCoordinates seedPv = seedPropagator.getPVCoordinates(epoch, inertial);
    Orbit initialOrbit = new CartesianOrbit(seedPv, inertial, epoch, Constants.EGM96_EARTH_MU);
    SpacecraftState initialState = new SpacecraftState(initialOrbit, context.spacecraft().wetMassKg());

    DormandPrince853Integrator integrator = new DormandPrince853Integrator(0.1, 120.0, 1.0, 1.0);
    org.orekit.propagation.numerical.NumericalPropagator propagator =
        new org.orekit.propagation.numerical.NumericalPropagator(integrator);
    propagator.setOrbitType(OrbitType.CARTESIAN);
    propagator.setPositionAngleType(PositionAngleType.TRUE);
    propagator.setMu(Constants.EGM96_EARTH_MU);
    propagator.setInitialState(initialState);

    forceModels(context).forEach(propagator::addForceModel);
    return propagator;
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
          .map(maneuver -> thrustManeuver(context, maneuver))
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

  private ConstantThrustManeuver thrustManeuver(PropagationContext context, ManeuverEvent maneuver) {
    Vector3D direction = thrustDirection(maneuver.vector());
    double thrust = numericMetadata(maneuver, "thrustN", context.spacecraft().nominalThrustN());
    double isp = numericMetadata(maneuver, "ispS", context.spacecraft().nominalIspS());
    AttitudeProvider attitude = attitudeProvider(maneuver.frame());
    return new ConstantThrustManeuver(
        OrekitStateMapper.toAbsoluteDate(maneuver.eventTime()),
        maneuver.durationSec(),
        thrust,
        isp,
        attitude,
        direction,
        "burn-" + maneuver.id());
  }

  private AttitudeProvider attitudeProvider(String frame) {
    String normalized = frame == null ? "" : frame.trim().toUpperCase(Locale.ROOT);
    if ("RTN".equals(normalized) || "RSW".equals(normalized) || "QSW".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.QSW);
    }
    if ("TNW".equals(normalized) || "VNC".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.TNW);
    }
    if ("LVLH".equals(normalized)) {
      return new LofOffset(orekit.eme2000(), LOFType.LVLH);
    }
    return new LofOffset(orekit.eme2000(), LOFType.QSW);
  }

  private Vector3D thrustDirection(Map<String, Double> vector) {
    Vector3D raw = new Vector3D(
        vector.getOrDefault("r", vector.getOrDefault("x", 0.0)),
        vector.getOrDefault("t", vector.getOrDefault("y", 1.0)),
        vector.getOrDefault("n", vector.getOrDefault("z", 0.0)));
    return raw.getNorm() == 0.0 ? Vector3D.PLUS_J : raw.normalize();
  }

  private double numericMetadata(ManeuverEvent maneuver, String key, double fallback) {
    Object value = maneuver.metadata().get(key);
    return value instanceof Number number ? number.doubleValue() : fallback;
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
