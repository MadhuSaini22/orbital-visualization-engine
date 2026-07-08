export function runtimeDateTimeToIso(value: string) {
  const date = new Date(`${value}:00.000Z`);
  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function validateRuntimeTimeRange(start: string, stop: string) {
  const startIso = runtimeDateTimeToIso(start);
  const stopIso = runtimeDateTimeToIso(stop);
  if (!startIso || !stopIso) {
    return { error: "Start and stop time are required." } as const;
  }
  if (new Date(stopIso).getTime() < new Date(startIso).getTime()) {
    return { error: "Stop time must be after start time." } as const;
  }
  return { error: null, startIso, stopIso };
}
