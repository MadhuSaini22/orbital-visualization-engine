import type { SatelliteObject, SatelliteVisualSettings } from "@/domain/orbit";
import { DEFAULT_SATELLITE_VISUAL, MAX_TLE_OBJECTS, parseTleText } from "@/domain/tle";

type SatelliteConfigEntry = {
  id?: string;
  name?: string;
  noradId?: string;
  sourceType?: "TLE" | "EPHEMERIS" | "MANUAL_STATE";
  tle?: {
    line1?: string;
    line2?: string;
  };
  visual?: Partial<SatelliteVisualSettings>;
  metadata?: SatelliteObject["metadata"];
};

type SatelliteConfigFile = {
  satellites?: SatelliteConfigEntry[];
};

export type SatelliteLoadResult = {
  satellites: SatelliteObject[];
  errors: string[];
};

function isJsonLike(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function normalizeVisual(visual?: Partial<SatelliteVisualSettings>): SatelliteVisualSettings {
  return {
    ...DEFAULT_SATELLITE_VISUAL,
    ...visual,
  };
}

function normalizeConfigShape(parsed: unknown): SatelliteConfigFile {
  if (Array.isArray(parsed)) {
    return { satellites: parsed as SatelliteConfigEntry[] };
  }

  if (parsed && typeof parsed === "object") {
    return parsed as SatelliteConfigFile;
  }

  return {};
}

function parseSatelliteJson(raw: string): SatelliteLoadResult {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      satellites: [],
      errors: ["The JSON satellite config is not valid JSON."],
    };
  }

  const config = normalizeConfigShape(parsed);
  const entries = config.satellites ?? [];

  if (entries.length === 0) {
    return {
      satellites: [],
      errors: ["The JSON satellite config must include a satellites array."],
    };
  }

  const satellites = entries.flatMap((entry, index): SatelliteObject[] => {
    const name = entry.name?.trim() || `Satellite ${index + 1}`;
    const line1 = entry.tle?.line1?.trim();
    const line2 = entry.tle?.line2?.trim();

    if (!line1 || !line2) {
      errors.push(`Satellite config entry "${name}" is missing TLE line1 or line2.`);
      return [];
    }

    const tleResult = parseTleText(`${name}\n${line1}\n${line2}`);
    if (tleResult.satellites.length === 0) {
      errors.push(...tleResult.errors.map((error) => `${name}: ${error}`));
      return [];
    }

    const parsedSatellite = tleResult.satellites[0];
    return [{
      ...parsedSatellite,
      id: entry.id?.trim() || parsedSatellite.id,
      name,
      noradId: entry.noradId?.trim() || parsedSatellite.noradId || parsedSatellite.id,
      sourceType: entry.sourceType ?? "TLE",
      visual: normalizeVisual(entry.visual),
      metadata: entry.metadata,
    }];
  });

  if (satellites.length > MAX_TLE_OBJECTS) {
    return {
      satellites: satellites.slice(0, MAX_TLE_OBJECTS),
      errors: [`Loaded the first ${MAX_TLE_OBJECTS} satellites only. The config contains ${satellites.length}.`],
    };
  }

  if (satellites.length === 0 && errors.length === 0) {
    errors.push("No valid satellites were found in the JSON config.");
  }

  return { satellites, errors };
}

export function parseSatelliteSource(raw: string): SatelliteLoadResult {
  if (isJsonLike(raw)) {
    return parseSatelliteJson(raw);
  }

  return parseTleText(raw);
}
