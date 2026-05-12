import type { SatelliteObject } from "@/domain/orbit";

export const MAX_TLE_OBJECTS = 15;

export const DEFAULT_SATELLITE_VISUAL = {
  showMarker: true,
  showLabel: true,
  showOrbit: true,
  showGroundTrack: false,
  showTrail: false,
} as const;

export type TleParseResult = {
  satellites: SatelliteObject[];
  errors: string[];
};

function checksumIsValid(line: string) {
  if (!/^\d .{67}$/.test(line)) {
    return false;
  }

  const expected = Number(line[68]);
  if (!Number.isInteger(expected)) {
    return false;
  }

  let sum = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= "0" && char <= "9") {
      sum += Number(char);
    } else if (char === "-") {
      sum += 1;
    }
  }

  return sum % 10 === expected;
}

function normalizeLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseTleText(raw: string): TleParseResult {
  const lines = normalizeLines(raw);
  const satellites: SatelliteObject[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    return {
      satellites,
      errors: ["The TLE file is empty."],
    };
  }

  for (let index = 0; index < lines.length; ) {
    const current = lines[index];
    const hasName = !current.startsWith("1 ") && !current.startsWith("2 ");
    const name = hasName ? current : `Satellite ${satellites.length + 1}`;
    const line1 = hasName ? lines[index + 1] : lines[index];
    const line2 = hasName ? lines[index + 2] : lines[index + 1];
    const humanLine = index + 1;

    if (!line1 || !line2) {
      errors.push(`Incomplete TLE entry near line ${humanLine}. Each object needs line 1 and line 2.`);
      break;
    }

    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      errors.push(`Invalid TLE entry near line ${humanLine}. Expected a line starting with "1 " followed by "2 ".`);
      index += hasName ? 3 : 2;
      continue;
    }

    const idFromLine1 = line1.slice(2, 7).trim();
    const idFromLine2 = line2.slice(2, 7).trim();
    if (idFromLine1 !== idFromLine2) {
      errors.push(`Invalid TLE for ${name}: satellite numbers do not match.`);
      index += hasName ? 3 : 2;
      continue;
    }

    if (!checksumIsValid(line1) || !checksumIsValid(line2)) {
      errors.push(`Invalid TLE checksum for ${name}. Please use a fresh TLE from CelesTrak.`);
      index += hasName ? 3 : 2;
      continue;
    }

    satellites.push({
      id: idFromLine1 || `sat-${satellites.length + 1}`,
      name,
      noradId: idFromLine1,
      sourceType: "TLE",
      tle: { line1, line2 },
      visual: { ...DEFAULT_SATELLITE_VISUAL },
    });

    index += hasName ? 3 : 2;
  }

  if (satellites.length > MAX_TLE_OBJECTS) {
    return {
      satellites: satellites.slice(0, MAX_TLE_OBJECTS),
      errors: [`Loaded the first ${MAX_TLE_OBJECTS} satellites only. The file contains ${satellites.length}.`],
    };
  }

  if (satellites.length === 0 && errors.length === 0) {
    errors.push("No valid TLE objects were found.");
  }

  return { satellites, errors };
}
