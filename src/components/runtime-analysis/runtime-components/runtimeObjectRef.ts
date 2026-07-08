import type { CreateManualOrbitRequest, RuntimeObjectRef } from "@/services/orbitServerApi";

export function manualOrbitRuntimeRef(orbitId: string | null | undefined, orbitDefinition?: CreateManualOrbitRequest | null): RuntimeObjectRef {
  return { type: "MANUAL_ORBIT", orbitId: orbitId ?? null, orbitDefinition: orbitDefinition ?? null };
}

export function catalogRuntimeRef(noradCatalogId: string | number): RuntimeObjectRef {
  return { type: "CATALOG_NORAD", noradCatalogId: Number(noradCatalogId), orbitDefinition: null };
}
