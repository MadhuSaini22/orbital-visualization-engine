import type { AccessWindow, GroundStation, VisibilitySample } from "@/domain/groundOperations";

function sampleTimeMs(sample: VisibilitySample) {
  return new Date(sample.timeUtc).getTime();
}

function interpolateCrossingTime(previous: VisibilitySample, next: VisibilitySample, thresholdDeg: number) {
  const previousOffset = previous.elevationDeg - thresholdDeg;
  const nextOffset = next.elevationDeg - thresholdDeg;
  const denominator = previousOffset - nextOffset;
  const fraction = denominator === 0 ? 0 : Math.max(0, Math.min(1, previousOffset / denominator));
  return new Date(sampleTimeMs(previous) + (sampleTimeMs(next) - sampleTimeMs(previous)) * fraction).toISOString();
}

function windowFromSamples(station: GroundStation, passNumber: number, samples: VisibilitySample[], aosUtc: string, losUtc: string): AccessWindow | null {
  if (samples.length === 0) {
    return null;
  }
  const peak = samples.reduce((best, sample) => sample.elevationDeg > best.elevationDeg ? sample : best, samples[0]);
  const durationSeconds = Math.max(0, Math.round((new Date(losUtc).getTime() - new Date(aosUtc).getTime()) / 1000));
  return {
    id: `${station.id}-${aosUtc}`,
    stationId: station.id,
    stationName: station.name,
    passNumber,
    aosUtc,
    losUtc,
    durationSeconds,
    maxElevationDeg: peak.elevationDeg,
    maxElevationTimeUtc: peak.timeUtc,
    orbitNumber: null,
  };
}

export class AccessWindowService {
  generateWindows(station: GroundStation, samples: VisibilitySample[]) {
    const sorted = [...samples].toSorted((a, b) => sampleTimeMs(a) - sampleTimeMs(b));
    const windows: AccessWindow[] = [];
    let activeSamples: VisibilitySample[] = [];
    let aosUtc: string | null = null;

    sorted.forEach((sample, index) => {
      const previous = sorted[index - 1];
      if (sample.visible) {
        if (!aosUtc) {
          aosUtc = previous
            ? interpolateCrossingTime(previous, sample, station.minimumElevation)
            : sample.timeUtc;
        }
        activeSamples.push(sample);
        return;
      }

      if (!aosUtc || activeSamples.length === 0) {
        return;
      }
      const lastVisible = activeSamples.at(-1)!;
      const losUtc = interpolateCrossingTime(lastVisible, sample, station.minimumElevation);
      const accessWindow = windowFromSamples(station, windows.length + 1, activeSamples, aosUtc, losUtc);
      if (accessWindow) {
        windows.push(accessWindow);
      }
      activeSamples = [];
      aosUtc = null;
    });

    if (aosUtc && activeSamples.length > 0) {
      const accessWindow = windowFromSamples(station, windows.length + 1, activeSamples, aosUtc, activeSamples.at(-1)!.timeUtc);
      if (accessWindow) {
        windows.push(accessWindow);
      }
    }

    return windows;
  }
}
