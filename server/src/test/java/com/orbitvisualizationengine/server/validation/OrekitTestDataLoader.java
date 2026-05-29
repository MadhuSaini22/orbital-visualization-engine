package com.orbitvisualizationengine.server.validation;

import java.io.File;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.orekit.data.DataContext;
import org.orekit.data.DataProvidersManager;
import org.orekit.data.DirectoryCrawler;
import org.orekit.time.DateComponents;
import org.orekit.time.OffsetModel;
import org.orekit.time.TimeScalesFactory;

/**
 * Shared Orekit data initializer for all validation tests.
 * Loads external datasets (EOP, gravity, space weather, ephemerides) once per JVM.
 * Falls back to built-in minimal UTC/TAI offsets when external data is absent,
 * so TLE-only tests can still run without the full dataset. The external data
 * path must be supplied explicitly with -Dorekit.data.path or OREKIT_DATA_PATH.
 */
public final class OrekitTestDataLoader {

    private static final AtomicBoolean initialized = new AtomicBoolean(false);
    private static volatile boolean fullDataAvailable = false;

    private OrekitTestDataLoader() {}

    /**
     * Ensures Orekit data is loaded. Returns true if the full external dataset
     * (EOP, gravity, space weather, planetary ephemerides) is available.
     */
    public static boolean ensureLoaded() {
        if (initialized.get()) {
            return fullDataAvailable;
        }
        synchronized (OrekitTestDataLoader.class) {
            if (initialized.get()) {
                return fullDataAvailable;
            }
            DataProvidersManager manager = DataContext.getDefault().getDataProvidersManager();
            manager.clearProviders();
            manager.clearLoadedDataNames();

            String dataPath = orekitDataPath();
            File dir = dataPath.isBlank() ? null : new File(dataPath);
            if (dir != null && dir.isDirectory()) {
                manager.addProvider(new DirectoryCrawler(dir));
                fullDataAvailable = true;
            } else {
                // Minimal fallback: register the IERS leap-second history so UTC parses correctly.
                TimeScalesFactory.addUTCTAIOffsetsLoader(OrekitTestDataLoader::utcTaiOffsets);
                fullDataAvailable = false;
            }
            initialized.set(true);
        }
        return fullDataAvailable;
    }

    public static String orekitDataPath() {
        String prop = System.getProperty("orekit.data.path");
        if (prop != null && !prop.isBlank()) {
            return prop;
        }
        String env = System.getenv("OREKIT_DATA_PATH");
        return env != null && !env.isBlank() ? env : "";
    }

    private static List<OffsetModel> utcTaiOffsets() {
        return List.of(
            leap(1972, 1, 1, 10), leap(1972, 7, 1, 11), leap(1973, 1, 1, 12),
            leap(1974, 1, 1, 13), leap(1975, 1, 1, 14), leap(1976, 1, 1, 15),
            leap(1977, 1, 1, 16), leap(1978, 1, 1, 17), leap(1979, 1, 1, 18),
            leap(1980, 1, 1, 19), leap(1981, 7, 1, 20), leap(1982, 7, 1, 21),
            leap(1983, 7, 1, 22), leap(1985, 7, 1, 23), leap(1988, 1, 1, 24),
            leap(1990, 1, 1, 25), leap(1991, 1, 1, 26), leap(1992, 7, 1, 27),
            leap(1993, 7, 1, 28), leap(1994, 7, 1, 29), leap(1996, 1, 1, 30),
            leap(1997, 7, 1, 31), leap(1999, 1, 1, 32), leap(2006, 1, 1, 33),
            leap(2009, 1, 1, 34), leap(2012, 7, 1, 35), leap(2015, 7, 1, 36),
            leap(2017, 1, 1, 37));
    }

    private static OffsetModel leap(int year, int month, int day, int taiMinusUtc) {
        return new OffsetModel(new DateComponents(year, month, day), taiMinusUtc);
    }
}
