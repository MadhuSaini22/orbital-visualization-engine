import type { OrbitState } from "@/domain/orbit";

export function splitGroundTrackByLongitudeWrap(states: OrbitState[]) {
  const segments: OrbitState[][] = [];
  let currentSegment: OrbitState[] = [];

  states.forEach((state, index) => {
    const previous = states[index - 1];

    if (previous && Math.abs(state.longitudeDeg - previous.longitudeDeg) > 180) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }

    currentSegment.push(state);
  });

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}
