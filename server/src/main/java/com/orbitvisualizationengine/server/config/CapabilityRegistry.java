package com.orbitvisualizationengine.server.config;

import com.orbitvisualizationengine.server.dto.CapabilityRegistryResponse;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class CapabilityRegistry {
  public CapabilityRegistryResponse response() {
    return new CapabilityRegistryResponse(
        propagators(),
        integrators(),
        forceModels(),
        new CapabilityRegistryResponse.ManeuverCapability(
            true,
            false,
            false,
            "Finite burns execute through mission timeline commands only when NUMERICAL propagation is selected."),
        List.of(
            "dryMassKg",
            "fuelMassKg",
            "dragAreaM2",
            "dragCoefficient",
            "srpAreaM2",
            "reflectivityCoefficient",
            "nominalThrustN",
            "nominalIspS"));
  }

  private List<CapabilityRegistryResponse.PropagatorCapability> propagators() {
    return List.of(
        new CapabilityRegistryResponse.PropagatorCapability(
            "NUMERICAL",
            "Numerical",
            "Orekit numerical propagation using the selected Hipparchus integrator and explicit force models.",
            true,
            true,
            true,
            true),
        new CapabilityRegistryResponse.PropagatorCapability(
            "KEPLERIAN",
            "Keplerian",
            "Two-body analytical propagation. Numerical force models, integrators, and finite burns are not consumed.",
            false,
            false,
            false,
            false),
        new CapabilityRegistryResponse.PropagatorCapability(
            "TLE_SGP4",
            "TLE SGP4",
            "SGP4 analytical propagation embedded in a TLE. Numerical force models and integrators are not consumed.",
            false,
            false,
            false,
            false));
  }

  private List<CapabilityRegistryResponse.IntegratorCapability> integrators() {
    return List.of(
        integrator("DORMAND_PRINCE_853", "Dormand Prince 853", "Adaptive high-order Runge-Kutta integrator.", true, "org.hipparchus.ode.nonstiff.DormandPrince853Integrator"),
        integrator("DORMAND_PRINCE_54", "Dormand Prince 54", "Adaptive Runge-Kutta integrator.", true, "org.hipparchus.ode.nonstiff.DormandPrince54Integrator"),
        integrator("CLASSICAL_RUNGE_KUTTA", "Classical Runge Kutta", "Fixed-step fourth-order Runge-Kutta integrator.", false, "org.hipparchus.ode.nonstiff.ClassicalRungeKuttaIntegrator"),
        integrator("GILL", "Gill", "Fixed-step Gill fourth-order Runge-Kutta integrator.", false, "org.hipparchus.ode.nonstiff.GillIntegrator"),
        integrator("LUTHER", "Luther", "Fixed-step high-order Luther integrator.", false, "org.hipparchus.ode.nonstiff.LutherIntegrator"),
        integrator("MIDPOINT", "Midpoint", "Fixed-step midpoint integrator.", false, "org.hipparchus.ode.nonstiff.MidpointIntegrator"),
        integrator("THREE_EIGHTHES", "Three Eighthes", "Fixed-step 3/8 Runge-Kutta integrator.", false, "org.hipparchus.ode.nonstiff.ThreeEighthesIntegrator"),
        integrator("ADAMS_BASHFORTH", "Adams Bashforth", "Adaptive explicit multistep integrator.", true, "org.hipparchus.ode.nonstiff.AdamsBashforthIntegrator"),
        integrator("ADAMS_MOULTON", "Adams Moulton", "Adaptive implicit multistep integrator.", true, "org.hipparchus.ode.nonstiff.AdamsMoultonIntegrator"),
        integrator("GRAGG_BULIRSCH_STOER", "Gragg Bulirsch Stoer", "Adaptive extrapolation integrator.", true, "org.hipparchus.ode.nonstiff.GraggBulirschStoerIntegrator"));
  }

  private CapabilityRegistryResponse.IntegratorCapability integrator(
      String id,
      String label,
      String description,
      boolean adaptiveStep,
      String backendClass) {
    return new CapabilityRegistryResponse.IntegratorCapability(id, label, description, adaptiveStep, backendClass);
  }

  private List<CapabilityRegistryResponse.ForceModelCapability> forceModels() {
    return List.of(
        force("gravity", "Gravity", "Holmes-Featherstone spherical harmonics using configured degree/order.", true),
        force("drag", "Atmospheric Drag", "NRLMSISE-00 with isotropic drag spacecraft model.", true),
        force("srp", "Solar Radiation Pressure", "Cannonball SRP using configured area and reflectivity.", true),
        force("sun", "Third Body Sun", "Solar third-body attraction.", true),
        force("moon", "Third Body Moon", "Lunar third-body attraction.", true),
        force("maneuver", "Finite Maneuver Model", "Mission timeline finite-burn commands.", true),
        force("relativity", "Relativity", "Future profile field; not yet implemented in Orekit force stack.", false),
        force("solidTides", "Solid Tides", "Future profile field; not yet implemented in Orekit force stack.", false),
        force("oceanTides", "Ocean Tides", "Future profile field; not yet implemented in Orekit force stack.", false));
  }

  private CapabilityRegistryResponse.ForceModelCapability force(String id, String label, String description, boolean implemented) {
    return new CapabilityRegistryResponse.ForceModelCapability(id, label, description, implemented, true);
  }
}
