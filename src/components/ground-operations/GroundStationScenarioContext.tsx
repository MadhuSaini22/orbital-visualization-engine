"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GroundStation, GroundStationDisplayOptions, GroundStationNetwork } from "@/domain/groundOperations";
import { groundStationCatalog } from "@/data/groundStationCatalog";
import { GroundStationRepository } from "@/services/GroundStationRepository";
import { makeWorkspaceId } from "@/services/workspaceStorage";

type GroundStationScenarioContextValue = {
  workspaceId: string;
  stations: GroundStation[];
  display: GroundStationDisplayOptions;
  repository: GroundStationRepository;
  assignmentVersion: number;
  setDisplay: (display: GroundStationDisplayOptions) => void;
  reloadStations: () => void;
  assignedStationIds: (orbitId: string | null) => string[];
  assignStation: (orbitId: string | null, stationId: string) => string[];
  assignStations: (orbitId: string | null, stationIds: string[]) => string[];
  unassignStation: (orbitId: string | null, stationId: string) => string[];
  createStation: (orbitId: string | null, station: Omit<GroundStation, "id">) => GroundStation;
  updateStation: (station: GroundStation) => GroundStation;
  deleteStation: (stationId: string) => void;
  cloneStation: (orbitId: string | null, station: GroundStation) => GroundStation;
  importStation: (orbitId: string | null, catalogId: string) => GroundStation | null;
  importNetwork: (orbitId: string | null, network: GroundStationNetwork) => GroundStation[];
};

const GroundStationScenarioContext = createContext<GroundStationScenarioContextValue | null>(null);

const defaultDisplay: GroundStationDisplayOptions = {
  stations: true,
  satelliteFootprints: true,
  stationAccessRegions: false,
  contactLines: true,
};

export function GroundStationScenarioProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const repository = useMemo(() => new GroundStationRepository(), []);
  const [stations, setStations] = useState<GroundStation[]>(() => repository.list(workspaceId));
  const [assignmentVersion, setAssignmentVersion] = useState(0);
  const [display, setDisplay] = useState<GroundStationDisplayOptions>(defaultDisplay);

  const reloadStations = useCallback(() => {
    setStations(repository.list(workspaceId));
  }, [repository, workspaceId]);

  const refreshAssignments = useCallback(() => {
    setAssignmentVersion((version) => version + 1);
  }, []);

  const assignedStationIds = useCallback((orbitId: string | null) => {
    return repository.assignedStationIds(workspaceId, orbitId);
  }, [repository, workspaceId]);

  const assignStation = useCallback((orbitId: string | null, stationId: string) => {
    const nextIds = repository.assignStation(workspaceId, orbitId, stationId);
    refreshAssignments();
    return nextIds;
  }, [refreshAssignments, repository, workspaceId]);

  const assignStations = useCallback((orbitId: string | null, stationIds: string[]) => {
    const nextIds = repository.assignStations(workspaceId, orbitId, stationIds);
    refreshAssignments();
    return nextIds;
  }, [refreshAssignments, repository, workspaceId]);

  const unassignStation = useCallback((orbitId: string | null, stationId: string) => {
    const nextIds = repository.unassignStation(workspaceId, orbitId, stationId);
    refreshAssignments();
    return nextIds;
  }, [refreshAssignments, repository, workspaceId]);

  const createStation = useCallback((orbitId: string | null, station: Omit<GroundStation, "id">) => {
    const saved = repository.save({
      ...station,
      id: makeWorkspaceId("ground-station"),
    });
    repository.assignStation(workspaceId, orbitId, saved.id);
    refreshAssignments();
    reloadStations();
    return saved;
  }, [refreshAssignments, reloadStations, repository, workspaceId]);

  const updateStation = useCallback((station: GroundStation) => {
    const saved = repository.save(station);
    reloadStations();
    return saved;
  }, [reloadStations, repository]);

  const deleteStation = useCallback((stationId: string) => {
    repository.delete(stationId);
    refreshAssignments();
    reloadStations();
  }, [refreshAssignments, reloadStations, repository]);

  const cloneStation = useCallback((orbitId: string | null, station: GroundStation) => {
    const cloned = repository.clone(station);
    repository.assignStation(workspaceId, orbitId, cloned.id);
    refreshAssignments();
    reloadStations();
    return cloned;
  }, [refreshAssignments, reloadStations, repository, workspaceId]);

  const importStation = useCallback((orbitId: string | null, catalogId: string) => {
    const catalogStation = groundStationCatalog.find((station) => station.catalogId === catalogId);
    if (!catalogStation) {
      return null;
    }
    const imported = repository.importStation(workspaceId, catalogStation);
    repository.assignStation(workspaceId, orbitId, imported.id);
    refreshAssignments();
    reloadStations();
    return imported;
  }, [refreshAssignments, reloadStations, repository, workspaceId]);

  const importNetwork = useCallback((orbitId: string | null, network: GroundStationNetwork) => {
    const imported = repository.importNetwork(workspaceId, network);
    repository.assignStations(workspaceId, orbitId, imported.map((station) => station.id));
    refreshAssignments();
    reloadStations();
    return imported;
  }, [refreshAssignments, reloadStations, repository, workspaceId]);

  const value = useMemo<GroundStationScenarioContextValue>(() => ({
    workspaceId,
    stations,
    display,
    repository,
    assignmentVersion,
    setDisplay,
    reloadStations,
    assignedStationIds,
    assignStation,
    assignStations,
    unassignStation,
    createStation,
    updateStation,
    deleteStation,
    cloneStation,
    importStation,
    importNetwork,
  }), [
    workspaceId,
    stations,
    display,
    repository,
    assignmentVersion,
    reloadStations,
    assignedStationIds,
    assignStation,
    assignStations,
    unassignStation,
    createStation,
    updateStation,
    deleteStation,
    cloneStation,
    importStation,
    importNetwork,
  ]);

  return (
    <GroundStationScenarioContext.Provider value={value}>
      {children}
    </GroundStationScenarioContext.Provider>
  );
}

export function useGroundStationScenario(orbitId: string | null) {
  const context = useContext(GroundStationScenarioContext);
  if (!context) {
    throw new Error("useGroundStationScenario must be used inside GroundStationScenarioProvider");
  }

  const assignedStationIds = useMemo(() => {
    void context.assignmentVersion;
    return context.assignedStationIds(orbitId);
  }, [context, orbitId]);

  const assignedStations = useMemo(() => {
    const assignedIds = new Set(assignedStationIds);
    return context.stations.filter((station) => assignedIds.has(station.id));
  }, [assignedStationIds, context.stations]);

  return {
    workspaceId: context.workspaceId,
    stations: context.stations,
    display: context.display,
    setDisplay: context.setDisplay,
    assignedStationIds,
    assignedStations,
    assignStation: context.assignStation,
    assignStations: context.assignStations,
    unassignStation: context.unassignStation,
    createStation: context.createStation,
    updateStation: context.updateStation,
    deleteStation: context.deleteStation,
    cloneStation: context.cloneStation,
    importStation: context.importStation,
    importNetwork: context.importNetwork,
  };
}
