const DEFAULT_ORBIT_SERVER_URL = "http://localhost:8080";

export function getOrbitServerBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_ORBIT_SERVER_URL?.trim();
  const baseUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : DEFAULT_ORBIT_SERVER_URL;

  return baseUrl.replace(/\/+$/, "");
}

export function getOrbitServerDisplayUrl() {
  return getOrbitServerBaseUrl().replace(/^https?:\/\//, "");
}

function buildPath(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function fetchCatalogGroupTle(group: string, limit: number) {
  const url = `${getOrbitServerBaseUrl()}${buildPath("/api/catalog/tle", { group, limit })}`;
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();

  if (!response.ok) {
    const detail = body.trim();
    throw new Error(
      detail
        ? `Backend TLE request failed with status ${response.status}: ${detail}`
        : `Backend TLE request failed with status ${response.status} at ${url}.`,
    );
  }

  return body;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  init?: RequestInit,
) {
  const url = `${getOrbitServerBaseUrl()}${buildPath(path, params)}`;
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();

  if (!response.ok) {
    let detail = body.trim();
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") {
        detail = parsed.error;
      }
    } catch {
      // Keep the plain-text response body as the error detail.
    }
    throw new Error(detail ? `Backend request failed with status ${response.status}: ${detail}` : `Backend request failed with status ${response.status} at ${url}.`);
  }

  return (body ? JSON.parse(body) : null) as T;
}

export type BackendManeuverEvent = {
  id: string;
  noradId: number;
  name: string;
  status: "PLANNED" | "CANDIDATE" | "EXECUTED" | "CANCELLED";
  eventTime: string;
  deltaVMps: number;
  durationSec: number;
  frame: string;
  vector?: Record<string, number>;
  metadata?: Record<string, unknown>;
};

export type BackendConjunctionRecord = {
  id: string;
  sat1NoradId: number | null;
  sat2NoradId: number | null;
  sat1Name: string | null;
  sat2Name: string | null;
  createdAt: string | null;
  tca: string;
  missDistanceKm: number | null;
  probabilityOfCollision: number | null;
  relativeVelocityKmps: number | null;
  risk: "SAFE" | "WATCH" | "WARNING" | "CRITICAL";
  source: string;
  rawCdm: string;
};

export async function fetchManeuvers(noradId?: string | number) {
  return fetchJson<BackendManeuverEvent[]>("/api/maneuvers", {
    noradId,
  });
}

export async function fetchConjunctions(noradIds: Array<string | number>) {
  const ids = [...new Set(noradIds.map((id) => String(id).trim()).filter(Boolean))];
  return fetchJson<{ conjunctions: BackendConjunctionRecord[] }>("/api/conjunctions", {
    noradIds: ids.length > 0 ? ids.join(",") : undefined,
  });
}

export async function refreshConjunctions() {
  return fetchJson<{ conjunctions: BackendConjunctionRecord[] }>("/api/conjunctions/refresh", {}, {
    method: "POST",
  });
}
