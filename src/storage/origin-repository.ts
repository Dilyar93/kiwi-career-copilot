import { browser } from 'wxt/browser';
import type { CommuteOrigin, KnownLocation } from '../location/location-types';
import { CommuteOriginSchema } from './storage-schemas';

export const COMMUTE_ORIGINS_KEY = 'commuteOrigins';

export async function getCommuteOrigins(): Promise<CommuteOrigin[]> {
  const stored = (await browser.storage.local.get(COMMUTE_ORIGINS_KEY))[COMMUTE_ORIGINS_KEY];
  if (stored === undefined) return [];
  return CommuteOriginSchema.array().max(1).parse(stored);
}

export async function getCommuteOrigin(id: string | null): Promise<CommuteOrigin | null> {
  if (!id) return null;
  return (await getCommuteOrigins()).find((origin) => origin.id === id) ?? null;
}

export async function saveKnownPlaceOrigin(location: KnownLocation): Promise<CommuteOrigin> {
  const existing = (await getCommuteOrigins())[0];
  const now = Date.now();
  return save({
    id: existing?.id ?? crypto.randomUUID(),
    label: location.canonicalName,
    latitude: Number(location.latitude.toFixed(3)),
    longitude: Number(location.longitude.toFixed(3)),
    accuracyMeters: null,
    uncertaintyKm: Math.max(0.1, location.uncertaintyKm),
    countryCode: 'NZ',
    knownLocationId: location.id,
    source: 'known-place',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function saveBrowserOrigin(
  latitude: number,
  longitude: number,
  accuracyMeters: number,
): Promise<CommuteOrigin> {
  const existing = (await getCommuteOrigins())[0];
  const now = Date.now();
  return save({
    id: existing?.id ?? crypto.randomUUID(),
    label: 'Current location',
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3)),
    accuracyMeters,
    uncertaintyKm: accuracyMeters / 1000 + 0.1,
    countryCode: 'NZ',
    knownLocationId: null,
    source: 'browser-geolocation',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function saveManualOrigin(
  label: string,
  latitude: number,
  longitude: number,
  uncertaintyKm: number,
): Promise<CommuteOrigin> {
  const existing = (await getCommuteOrigins())[0];
  const now = Date.now();
  return save({
    id: existing?.id ?? crypto.randomUUID(),
    label,
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3)),
    accuracyMeters: null,
    uncertaintyKm: Math.max(0.1, uncertaintyKm),
    countryCode: 'NZ',
    knownLocationId: null,
    source: 'manual-coordinate',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function clearCommuteOrigins(): Promise<void> {
  await browser.storage.local.remove(COMMUTE_ORIGINS_KEY);
}

async function save(input: CommuteOrigin): Promise<CommuteOrigin> {
  const origin = CommuteOriginSchema.parse(input);
  await browser.storage.local.set({ [COMMUTE_ORIGINS_KEY]: [origin] });
  return origin;
}
