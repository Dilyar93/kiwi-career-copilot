import type { DistanceMetadata, LocationConfidence } from '../core/rules/rule-types';
import type { CommuteOrigin, KnownLocation } from './location-types';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export function haversineDistanceKm(a: Coordinate, b: Coordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude))
      * Math.cos(radians(b.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

export function conservativeDistance(
  centreDistanceKm: number,
  originUncertaintyKm: number,
  destinationUncertaintyKm: number,
): number {
  return Math.max(0, centreDistanceKm - originUncertaintyKm - destinationUncertaintyKm);
}

export function distanceToCandidates(
  origin: CommuteOrigin,
  candidates: KnownLocation[],
  confidence: LocationConfidence,
): DistanceMetadata | undefined {
  return candidates
    .map((candidate): DistanceMetadata => {
      const centreDistanceKm = haversineDistanceKm(origin, candidate);
      return {
        centreDistanceKm,
        conservativeDistanceKm: conservativeDistance(
          centreDistanceKm,
          origin.uncertaintyKm,
          candidate.uncertaintyKm,
        ),
        confidence,
        originUncertaintyKm: origin.uncertaintyKm,
        destinationUncertaintyKm: candidate.uncertaintyKm,
      };
    })
    .sort((a, b) => a.conservativeDistanceKm - b.conservativeDistanceKm)[0];
}
