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
