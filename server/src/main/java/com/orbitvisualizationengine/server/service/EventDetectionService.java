package com.orbitvisualizationengine.server.service;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class EventDetectionService {

  public List<DetectorCapability> capabilities() {
    return List.of(
        new DetectorCapability(EventMarkerType.PERIGEE, "org.orekit.propagation.events.ApsideDetector", "FOUNDATION", "Exact apsis event timing during propagation."),
        new DetectorCapability(EventMarkerType.APOGEE, "org.orekit.propagation.events.ApsideDetector", "FOUNDATION", "Exact apsis event timing during propagation."),
        new DetectorCapability(EventMarkerType.ASCENDING_NODE, "org.orekit.propagation.events.NodeDetector", "FOUNDATION", "Node-crossing event timing for plane-change and operations products."),
        new DetectorCapability(EventMarkerType.DESCENDING_NODE, "org.orekit.propagation.events.NodeDetector", "FOUNDATION", "Node-crossing event timing for plane-change and operations products."),
        new DetectorCapability(EventMarkerType.ECLIPSE_ENTRY, "org.orekit.propagation.events.EclipseDetector", "FOUNDATION", "Power and thermal event reporting."),
        new DetectorCapability(EventMarkerType.ECLIPSE_EXIT, "org.orekit.propagation.events.EclipseDetector", "FOUNDATION", "Power and thermal event reporting."),
        new DetectorCapability(EventMarkerType.ALTITUDE_CROSSING, "org.orekit.propagation.events.AltitudeDetector", "FOUNDATION", "Reentry, safety, and keep-out altitude event reporting."),
        new DetectorCapability(EventMarkerType.GROUND_STATION_RISE, "org.orekit.propagation.events.ElevationDetector", "FOUNDATION", "Ground-station access window rise event reporting."),
        new DetectorCapability(EventMarkerType.GROUND_STATION_SET, "org.orekit.propagation.events.ElevationDetector", "FOUNDATION", "Ground-station access window set event reporting.")
    );
  }

  public EventReport emptyReport(String missionId) {
    return new EventReport(
        missionId,
        List.of(),
        capabilities(),
        List.of("Event detector service foundation is registered. Detector execution will be wired into propagation in a future sprint.")
    );
  }
}
