import type { RuntimeObjectRef } from "@/services/orbitServerApi";

export function manualOrbitRuntimeRef(orbitId: string): RuntimeObjectRef {
  return { type: "MANUAL_ORBIT", orbitId };
}

export function catalogRuntimeRef(noradCatalogId: string | number): RuntimeObjectRef {
  return { type: "CATALOG_NORAD", noradCatalogId: Number(noradCatalogId) };
}
