import type { AccessWindow } from "@/domain/groundOperations";

export class PassPredictionService {
  getUpcomingPasses(windows: AccessWindow[], nowUtc: string) {
    const nowMs = new Date(nowUtc).getTime();
    return windows
      .filter((window) => new Date(window.losUtc).getTime() >= nowMs)
      .toSorted((a, b) => new Date(a.aosUtc).getTime() - new Date(b.aosUtc).getTime());
  }

  getNextPass(windows: AccessWindow[], nowUtc: string) {
    return this.getUpcomingPasses(windows, nowUtc)[0] ?? null;
  }
}
