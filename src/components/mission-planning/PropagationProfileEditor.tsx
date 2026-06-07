import { useState } from "react";
import type { BackendCapabilityRegistry, BackendPropagationProfile, NumericalIntegratorTypeId, PropagatorTypeId, UpdatePropagationProfileRequest } from "@/services/orbitServerApi";
import { DetailMetric } from "./ui";
import { compactIsoUtc } from "./utils";

export function PropagationProfileEditor({
  profile,
  capabilities,
  status,
  surface = "analysis",
  defaultShowAdvanced = false,
  defaultShowExpert = false,
  onDraftChange,
}: {
  profile: BackendPropagationProfile;
  capabilities: BackendCapabilityRegistry;
  status: string | null;
  surface?: "planner" | "analysis";
  defaultShowAdvanced?: boolean;
  defaultShowExpert?: boolean;
  onDraftChange: (request: UpdatePropagationProfileRequest) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(defaultShowAdvanced);
  const [showExpert, setShowExpert] = useState(defaultShowExpert);
  const [setupDraft, setSetupDraft] = useState(() => propagationSetupDraftFromProfile(profile));
  const [forceDraft, setForceDraft] = useState(() => forceDraftFromProfile(profile));
  const [advancedDraft, setAdvancedDraft] = useState(() => spacecraftDraftFromProfile(profile));
  const [expertDraft, setExpertDraft] = useState(() => integratorDraftFromProfile(profile));
  const isNumericalDraft = setupDraft.propagatorType === "NUMERICAL";
  const isKeplerianDraft = setupDraft.propagatorType === "KEPLERIAN";
  const isSgp4Draft = setupDraft.propagatorType === "TLE_SGP4";
  const selectedPropagatorCapability = capabilities.propagators.find((item) => item.id === setupDraft.propagatorType);

  const forceModes = [
    { key: "gravityEnabled" as const, label: "Gravity" },
    { key: "dragEnabled" as const, label: "Drag" },
    { key: "solarRadiationPressureEnabled" as const, label: "SRP" },
    { key: "thirdBodySunEnabled" as const, label: "Sun" },
    { key: "thirdBodyMoonEnabled" as const, label: "Moon" },
    { key: "maneuverModelEnabled" as const, label: "Maneuver" },
  ];

  const emitDraft = (
    nextSetup = setupDraft,
    nextForce = forceDraft,
    nextAdvanced = advancedDraft,
    nextExpert = expertDraft,
  ) => {
    onDraftChange(propagationDraftUpdateFromParts(profile, nextSetup, nextForce, nextAdvanced, nextExpert));
  };

  const updateSetupDraft = (patch: Partial<typeof setupDraft>) => {
    const next = { ...setupDraft, ...patch };
    setSetupDraft(next);
    emitDraft(next, forceDraft, advancedDraft, expertDraft);
  };

  const updateForceDraft = (patch: Partial<typeof forceDraft>) => {
    const next = { ...forceDraft, ...patch };
    setForceDraft(next);
    emitDraft(setupDraft, next, advancedDraft, expertDraft);
  };

  const updateAdvancedDraft = (key: keyof typeof advancedDraft, value: string) => {
    const next = { ...advancedDraft, [key]: value };
    setAdvancedDraft(next);
    emitDraft(setupDraft, forceDraft, next, expertDraft);
  };

  const updateExpertDraft = (key: keyof typeof expertDraft, value: string) => {
    const next = { ...expertDraft, [key]: value };
    setExpertDraft(next);
    emitDraft(setupDraft, forceDraft, advancedDraft, next);
  };

  return (
    <div className="mt-5 border border-cyan-300/15 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">
            {surface === "planner" ? "Mission Definition: Propagation Setup" : "Analysis: Propagation Setup"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {surface === "planner"
              ? `${profile.name} · system defaults are visible here before the first run; edits are saved to the backend mission profile used by trajectory generation and Orekit propagator construction.`
              : `${profile.name} · review or edit the mission profile that generated, or will regenerate, trajectory results.`}
          </p>
        </div>
        <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
          {profile.preset.replaceAll("_", " ")} default
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Propagator Type</span>
          <select
            value={setupDraft.propagatorType}
            onChange={(event) => updateSetupDraft({ propagatorType: event.target.value as PropagatorTypeId })}
            className="mt-1 w-full border border-white/10 bg-black/35 px-2 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
          >
            {capabilities.propagators.map((propagator) => (
              <option key={propagator.id} value={propagator.id}>{propagator.label}</option>
            ))}
          </select>
        </label>
        {selectedPropagatorCapability?.supportsIntegrators ? (
          <IntegratorSelector
            capabilities={capabilities}
            value={setupDraft.integratorType}
            onChange={(integratorType) => updateSetupDraft({ integratorType })}
          />
        ) : (
          <DetailMetric label="Integrator" value={isSgp4Draft ? "Embedded in SGP4" : "Not applicable"} />
        )}
        <DetailMetric label="Profile Revision" value={compactIsoUtc(profile.updatedAt)} />
        {isNumericalDraft && (
          <>
            <ProfileNumberInput
              label="Gravity Degree"
              value={setupDraft.gravityDegree}
              onChange={(value) => updateSetupDraft({ gravityDegree: value })}
            />
            <ProfileNumberInput
              label="Gravity Order"
              value={setupDraft.gravityOrder}
              onChange={(value) => updateSetupDraft({ gravityOrder: value })}
            />
          </>
        )}
      </div>

      {selectedPropagatorCapability?.supportsForceModels ? (
        <ForceModelGrid forceDraft={forceDraft} forceModes={forceModes} onChange={updateForceDraft} />
      ) : (
        <div className="mt-3 border border-white/10 bg-black/25 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Force Models</p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {isKeplerianDraft && "Not applicable. Keplerian analytical propagation uses two-body motion and does not consume numerical gravity degree/order, drag, SRP, Sun, Moon, tides, or integrator controls."}
            {isSgp4Draft && "Embedded in SGP4. TLE SGP4 uses the analytical model encoded by the TLE and does not consume numerical force-model or integrator controls."}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {selectedPropagatorCapability?.supportsSpacecraftParameters && (
          <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="workspace-action">
            {showAdvanced ? "Hide Advanced" : "Advanced"}
          </button>
        )}
        {selectedPropagatorCapability?.supportsIntegrators && (
          <button type="button" onClick={() => setShowExpert((value) => !value)} className="workspace-action">
            {showExpert ? "Hide Expert" : "Expert"}
          </button>
        )}
      </div>

      {selectedPropagatorCapability?.supportsSpacecraftParameters && showAdvanced && (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 md:col-span-4">Spacecraft Physical Parameters</p>
          {[
            ["dryMassKg", "Dry Mass kg"],
            ["fuelMassKg", "Fuel Mass kg"],
            ["dragAreaM2", "Drag Area m2"],
            ["dragCoefficient", "Drag Cd"],
            ["srpAreaM2", "SRP Area m2"],
            ["reflectivityCoefficient", "Reflectivity"],
            ["nominalThrustN", "Thrust N"],
            ["nominalIspS", "ISP s"],
          ].map(([key, label]) => (
            <ProfileNumberInput
              key={key}
              label={label}
              value={advancedDraft[key as keyof typeof advancedDraft]}
              onChange={(value) => updateAdvancedDraft(key as keyof typeof advancedDraft, value)}
            />
          ))}
        </div>
      )}

      {selectedPropagatorCapability?.supportsIntegrators && showExpert && (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 md:col-span-4">Numerical Integrator Settings</p>
          {[
            ["integratorMinStep", "Min Step s"],
            ["integratorMaxStep", "Max Step s"],
            ["integratorAbsTol", "Abs Tol"],
            ["integratorRelTol", "Rel Tol"],
          ].map(([key, label]) => (
            <ProfileNumberInput
              key={key}
              label={label}
              value={expertDraft[key as keyof typeof expertDraft]}
              onChange={(value) => updateExpertDraft(key as keyof typeof expertDraft, value)}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-zinc-500">
        {status ?? "Edits are staged locally and saved by the Mission Planner trajectory action or the Analysis footer action."}
      </p>
    </div>
  );
}

function ProfileNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-white/10 bg-black/35 px-2 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
      />
    </label>
  );
}

export function IntegratorSelector({
  capabilities,
  value,
  onChange,
}: {
  capabilities: BackendCapabilityRegistry;
  value: NumericalIntegratorTypeId;
  onChange: (integratorType: NumericalIntegratorTypeId) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Integrator Type</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as NumericalIntegratorTypeId)}
        className="mt-1 w-full border border-white/10 bg-black/35 px-2 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
      >
        {capabilities.integrators.map((integrator) => (
          <option key={integrator.id} value={integrator.id}>
            {integrator.label}{integrator.adaptiveStep ? " · adaptive" : " · fixed step"}
          </option>
        ))}
      </select>
    </label>
  );
}

type ForceDraft = ReturnType<typeof forceDraftFromProfile>;
type ForceMode = { key: keyof ForceDraft; label: string };

export function ForceModelGrid({
  forceDraft,
  forceModes,
  onChange,
}: {
  forceDraft: ForceDraft;
  forceModes: ForceMode[];
  onChange: (patch: Partial<ForceDraft>) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      <p className="col-span-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Force Models</p>
      {forceModes.map((mode) => {
        const checked = Boolean(forceDraft[mode.key]);
        return (
          <button
            key={mode.key}
            type="button"
            aria-pressed={checked}
            onClick={() => onChange({ [mode.key]: !checked })}
            className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${checked ? "border-lime-300 bg-lime-300/15 text-lime-100" : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-zinc-200"}`}
          >
            {mode.label}
          </button>
        );
      })}
      <button type="button" disabled className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-600" title="Future force model. Not currently sent to Orekit.">
        Relativity Off
      </button>
      <button type="button" disabled className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-600" title="Future force model. Not currently sent to Orekit.">
        Solid Tides Off
      </button>
      <button type="button" disabled className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-600" title="Future force model. Not currently sent to Orekit.">
        Ocean Tides Off
      </button>
    </div>
  );
}

function propagationSetupDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    propagatorType: profile.propagatorType,
    integratorType: profile.integratorType,
    gravityDegree: String(profile.gravityDegree),
    gravityOrder: String(profile.gravityOrder),
  };
}

function forceDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    gravityEnabled: profile.gravityEnabled,
    dragEnabled: profile.dragEnabled,
    solarRadiationPressureEnabled: profile.solarRadiationPressureEnabled,
    thirdBodySunEnabled: profile.thirdBodySunEnabled,
    thirdBodyMoonEnabled: profile.thirdBodyMoonEnabled,
    maneuverModelEnabled: profile.maneuverModelEnabled,
  };
}

function spacecraftDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    dryMassKg: String(profile.dryMassKg),
    fuelMassKg: String(profile.fuelMassKg),
    dragAreaM2: String(profile.dragAreaM2),
    dragCoefficient: String(profile.dragCoefficient),
    srpAreaM2: String(profile.srpAreaM2),
    reflectivityCoefficient: String(profile.reflectivityCoefficient),
    nominalThrustN: String(profile.nominalThrustN),
    nominalIspS: String(profile.nominalIspS),
  };
}

function integratorDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    integratorMinStep: String(profile.integratorMinStep),
    integratorMaxStep: String(profile.integratorMaxStep),
    integratorAbsTol: String(profile.integratorAbsTol),
    integratorRelTol: String(profile.integratorRelTol),
  };
}

function numberFromDraft(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function propagationDraftUpdateFromParts(
  profile: BackendPropagationProfile,
  setupDraft: ReturnType<typeof propagationSetupDraftFromProfile>,
  forceDraft: ReturnType<typeof forceDraftFromProfile>,
  advancedDraft: ReturnType<typeof spacecraftDraftFromProfile>,
  expertDraft: ReturnType<typeof integratorDraftFromProfile>,
): UpdatePropagationProfileRequest {
  return {
    propagatorType: setupDraft.propagatorType,
    integratorType: setupDraft.integratorType,
    gravityDegree: Math.trunc(Math.max(0, numberFromDraft(setupDraft.gravityDegree, profile.gravityDegree))),
    gravityOrder: Math.trunc(Math.max(0, numberFromDraft(setupDraft.gravityOrder, profile.gravityOrder))),
    ...forceDraft,
    dryMassKg: numberFromDraft(advancedDraft.dryMassKg, profile.dryMassKg),
    fuelMassKg: numberFromDraft(advancedDraft.fuelMassKg, profile.fuelMassKg),
    dragAreaM2: numberFromDraft(advancedDraft.dragAreaM2, profile.dragAreaM2),
    dragCoefficient: numberFromDraft(advancedDraft.dragCoefficient, profile.dragCoefficient),
    srpAreaM2: numberFromDraft(advancedDraft.srpAreaM2, profile.srpAreaM2),
    reflectivityCoefficient: numberFromDraft(advancedDraft.reflectivityCoefficient, profile.reflectivityCoefficient),
    nominalThrustN: numberFromDraft(advancedDraft.nominalThrustN, profile.nominalThrustN),
    nominalIspS: numberFromDraft(advancedDraft.nominalIspS, profile.nominalIspS),
    integratorMinStep: numberFromDraft(expertDraft.integratorMinStep, profile.integratorMinStep),
    integratorMaxStep: numberFromDraft(expertDraft.integratorMaxStep, profile.integratorMaxStep),
    integratorAbsTol: numberFromDraft(expertDraft.integratorAbsTol, profile.integratorAbsTol),
    integratorRelTol: numberFromDraft(expertDraft.integratorRelTol, profile.integratorRelTol),
  };
}
