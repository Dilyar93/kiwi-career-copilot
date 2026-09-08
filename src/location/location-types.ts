import type { LocationConfidence } from '../core/rules/rule-types';

export type LocalityType =
  | 'suburb'
  | 'locality'
  | 'town'
  | 'city'
  | 'district'
  | 'region';

export interface KnownLocation {
  id: string;
  canonicalName: string;
  majorName: string | null;
  aliases: string[];
  latitude: number;
  longitude: number;
  uncertaintyKm: number;
  localityType: LocalityType;
  regionCode: string | null;
  countryCode: 'NZ';
}

export interface LocationResolution {
  candidates: KnownLocation[];
  confidence: LocationConfidence;
  distanceEligible: boolean;
  isRemote: boolean;
  isHybrid: boolean;
  reason:
    | 'resolved'
    | 'ambiguous'
    | 'empty'
    | 'remote'
    | 'multiple-locations'
    | 'unparsed';
}

export interface CommuteOrigin {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  uncertaintyKm: number;
  countryCode: 'NZ';
  knownLocationId: string | null;
  source: 'browser-geolocation' | 'known-place' | 'manual-coordinate';
  createdAt: number;
  updatedAt: number;
}

export interface LocationDataset {
  format: 'jobfilter-nz-locations';
  schemaVersion: 1;
  dataVersion: string;
  locations: KnownLocation[];
}

export interface LocationProvider {
  readonly id: string;
  readonly countryCode: string;
  readonly dataVersion: string;
  normalizeLocationText(input: string): string;
  resolveLocation(input: string): LocationResolution;
  getLocationById(id: string): KnownLocation | null;
  searchLocations(query: string, limit?: number): KnownLocation[];
}
