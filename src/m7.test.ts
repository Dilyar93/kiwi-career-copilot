import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeJob } from './core/jobs/job-normalizer';
import { evaluateJob } from './core/rules/rule-engine';
import {
  conservativeDistance,
  distanceToCandidates,
  haversineDistanceKm,
} from './location/distance';
import { NzLocationProvider } from './location/nz-location-provider';
import type {
  CommuteOrigin,
  KnownLocation,
  LocationDataset,
  LocationProvider,
} from './location/location-types';
import {
  getCommuteOrigins,
  saveBrowserOrigin,
  saveKnownPlaceOrigin,
} from './storage/origin-repository';
import { createExportBundle } from './storage/import-export';
import { createDefaultFilterSettings } from './storage/migration';

const datasetText = await readFile(
  new URL('../public/data/locations/nz/locations.compact.json', import.meta.url),
  'utf8',
);
const dataset = JSON.parse(datasetText) as LocationDataset;
const manifest = JSON.parse(await readFile(
  new URL('../public/data/locations/nz/dataset-manifest.json', import.meta.url),
  'utf8',
)) as {
  locationCount: number;
  sourceRecordCount: number;
  sources: Array<{ licence: string; sha256: string }>;
};
const provider = new NzLocationProvider(dataset.locations, dataset.dataVersion);

describe('M7 nationwide location data and resolution', () => {
  it('ships licensed, hashed nationwide data including the outer islands', () => {
    const contract: LocationProvider = provider;
    expect(contract).toMatchObject({ id: 'nz-locations', countryCode: 'NZ' });
    expect(contract.dataVersion).not.toBe('unknown');
    expect(dataset.locations).toHaveLength(manifest.locationCount);
    expect(datasetText).not.toContain('"geometry"');
    expect(dataset.locations.every((location) =>
      location.countryCode === 'NZ'
      && Number.isFinite(location.latitude)
      && Number.isFinite(location.longitude)
      && location.uncertaintyKm >= 0.1,
    )).toBe(true);
    expect(manifest.sources[0]).toMatchObject({
      licence: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    });
    expect(manifest.sourceRecordCount).toBe(6562);
    expect(manifest.sources[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(provider.resolve('Rakiura').candidates.length).toBeGreaterThan(0);
    expect(provider.resolve('Chatham Island').candidates.length).toBeGreaterThan(0);
  });

  it('handles macrons, specificity, context, ambiguity, remote and hybrid text', () => {
    expect(provider.resolve('Whangarei').candidates[0]?.canonicalName).toMatch(/Whangārei/i);
    expect(provider.resolve('Hamilton Central, Waikato')).toMatchObject({
      confidence: 'high',
      distanceEligible: true,
    });
    expect(provider.resolve('Hamilton Central, Waikato').candidates[0]?.canonicalName)
      .toBe('Hamilton Central');
    expect(provider.resolve('Richmond').candidates.length).toBeGreaterThan(1);
    expect(provider.resolve('Richmond, Nelson')).toMatchObject({
      confidence: 'high',
      distanceEligible: true,
    });
    expect(provider.resolveLocation('Hamilton & Cambridge').candidates.length)
      .toBeGreaterThan(1);
    expect(provider.resolveLocation('Waikato')).toMatchObject({
      confidence: 'unknown',
      distanceEligible: false,
    });
    expect(provider.resolveLocation('Auckland')).toMatchObject({
      confidence: 'medium',
      distanceEligible: true,
    });
    expect(provider.resolve('Remote / Work from home')).toMatchObject({
      reason: 'remote',
      distanceEligible: false,
    });
    expect(provider.resolve('Hybrid - Hamilton')).toMatchObject({
      isHybrid: true,
      distanceEligible: false,
    });
  });
});

describe('M7 conservative distance filtering', () => {
  const origin: CommuteOrigin = {
    id: 'origin',
    label: 'Origin',
    latitude: 0,
    longitude: 0,
    accuracyMeters: null,
    uncertaintyKm: 5,
    countryCode: 'NZ',
    knownLocationId: null,
    source: 'manual-coordinate',
    createdAt: 1,
    updatedAt: 1,
  };

  it('uses the WGS84 mean Earth radius and subtracts both uncertainties', () => {
    expect(haversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    )).toBeCloseTo(111.195, 3);
    expect(conservativeDistance(20, 4, 7)).toBe(9);
    expect(conservativeDistance(5, 4, 7)).toBe(0);
  });

  it('uses the minimum conservative distance for ambiguous candidates', () => {
    const candidates: KnownLocation[] = [1, 2].map((longitude, index) => ({
      id: `place-${index}`,
      canonicalName: `Place ${index}`,
      majorName: null,
      aliases: [],
      latitude: 0,
      longitude,
      uncertaintyKm: 5,
      localityType: 'town',
      regionCode: null,
      countryCode: 'NZ',
    }));
    const distance = distanceToCandidates(origin, candidates, 'low')!;
    expect(distance.centreDistanceKm).toBeCloseTo(111.195, 3);
    expect(distance.conservativeDistanceKm).toBeCloseTo(101.195, 3);

    const job = normalizeJob({
      source: 'seek-nz',
      externalId: '1',
      canonicalUrl: 'https://www.seek.co.nz/job/1',
      title: 'Job',
      company: null,
      locationText: 'Ambiguous',
      summaryText: null,
      pageUrl: 'https://www.seek.co.nz/jobs',
      extractedAt: 1,
      adapterVersion: 1,
    });
    const rule = {
      id: 'distance',
      type: 'max-distance' as const,
      enabled: true,
      maximumKm: 102,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(evaluateJob(job, {
      rules: [rule],
      distance: { ...distance, distanceEligible: true },
    }).visible).toBe(true);
    expect(evaluateJob(job, {
      rules: [{ ...rule, maximumKm: 100 }],
      distance: { ...distance, distanceEligible: true },
    }).visible).toBe(false);
    expect(evaluateJob(job, {
      rules: [{ ...rule, maximumKm: 1 }],
      distance: { ...distance, distanceEligible: false },
    }).visible).toBe(true);
  });
});

describe('M7 local commute origin', () => {
  it('rounds private coordinates and carries conservative uncertainty', async () => {
    fakeBrowser.reset();
    const browserOrigin = await saveBrowserOrigin(-36.848461, 174.763336, 250);
    expect(browserOrigin).toMatchObject({
      latitude: -36.848,
      longitude: 174.763,
      accuracyMeters: 250,
      uncertaintyKm: 0.35,
      source: 'browser-geolocation',
    });
    const known = provider.search('Hamilton Central')[0]!;
    const knownOrigin = await saveKnownPlaceOrigin(known);
    expect(knownOrigin.latitude.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    expect(knownOrigin.uncertaintyKm).toBe(known.uncertaintyKm);
    expect(await getCommuteOrigins()).toEqual([knownOrigin]);

    const preferences = {
      schemaVersion: 1 as const,
      locale: 'en-NZ' as const,
      ui: { showDistance: true, showSeen: true },
    };
    const settings = createDefaultFilterSettings(() => 'profile');
    expect(createExportBundle(preferences, settings)).not.toHaveProperty('commuteOrigins');
    expect(createExportBundle(preferences, settings, new Date(0), [knownOrigin]))
      .toHaveProperty('commuteOrigins.0.latitude', knownOrigin.latitude);
  });
});
