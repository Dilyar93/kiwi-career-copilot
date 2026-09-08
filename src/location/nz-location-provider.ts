import { normalizeText } from '../core/text/normalize-text';
import { haversineDistanceKm } from './distance';
import type {
  KnownLocation,
  LocationDataset,
  LocationProvider,
  LocationResolution,
} from './location-types';

interface IndexedLocation {
  location: KnownLocation;
  canonical: boolean;
}

interface Match extends IndexedLocation {
  start: number;
  end: number;
}

const remotePattern = /\b(remote|work from home|working from home|wfh)\b/;
const hybridPattern = /\bhybrid\b/;
const multiplePattern = /\bmultiple locations?\b/;
const broadNzRegions = [
  'Northland', 'Waikato', 'Bay of Plenty', "Hawke's Bay", 'Taranaki',
  'Manawatū-Whanganui', 'Tasman', 'Marlborough', 'West Coast', 'Canterbury',
  'Otago', 'Southland',
];

function assertDataset(input: unknown): asserts input is LocationDataset {
  if (
    typeof input !== 'object' || input === null
    || !('format' in input) || input.format !== 'jobfilter-nz-locations'
    || !('schemaVersion' in input) || input.schemaVersion !== 1
    || !('dataVersion' in input) || typeof input.dataVersion !== 'string'
    || !('locations' in input) || !Array.isArray(input.locations)
  ) {
    throw new Error('Invalid location dataset');
  }
}

export class NzLocationProvider implements LocationProvider {
  readonly id = 'nz-locations';
  readonly countryCode = 'NZ';
  private readonly aliases = new Map<string, IndexedLocation[]>();
  private readonly markedAliases = new Map<string, IndexedLocation[]>();
  private readonly byId = new Map<string, KnownLocation>();
  private readonly administrativeNames = new Set(
    broadNzRegions.map((name) => normalizeText(name)),
  );
  private readonly maxAliasWords: number;

  constructor(
    readonly locations: KnownLocation[],
    readonly dataVersion = 'unknown',
  ) {
    let maxAliasWords = 1;
    for (const location of locations) {
      this.byId.set(location.id, location);
      for (const name of location.regionCode?.split(',') ?? []) {
        this.administrativeNames.add(this.normalizeLocationText(name));
      }
      for (const name of [location.canonicalName, ...location.aliases]) {
        const alias = this.normalizeLocationText(name);
        if (!alias) continue;
        maxAliasWords = Math.max(maxAliasWords, alias.split(' ').length);
        const entries = this.aliases.get(alias) ?? [];
        entries.push({
          location,
          canonical: alias === normalizeText(location.canonicalName),
        });
        this.aliases.set(alias, entries);
        const markedAlias = normalizeText(name, { stripMarks: false });
        const markedEntries = this.markedAliases.get(markedAlias) ?? [];
        markedEntries.push({
          location,
          canonical: markedAlias === normalizeText(
            location.canonicalName,
            { stripMarks: false },
          ),
        });
        this.markedAliases.set(markedAlias, markedEntries);
      }
    }
    for (const location of locations) {
      if (location.localityType === 'city') {
        this.administrativeNames.delete(
          this.normalizeLocationText(location.canonicalName),
        );
      }
    }
    this.maxAliasWords = maxAliasWords;
  }

  static async load(url: string): Promise<NzLocationProvider> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Location dataset HTTP ${response.status}`);
    const dataset: unknown = await response.json();
    assertDataset(dataset);
    return new NzLocationProvider(dataset.locations, dataset.dataVersion);
  }

  getById(id: string): KnownLocation | undefined {
    return this.byId.get(id);
  }

  normalizeLocationText(input: string): string {
    return normalizeText(input);
  }

  getLocationById(id: string): KnownLocation | null {
    return this.getById(id) ?? null;
  }

  search(query: string, limit = 20): KnownLocation[] {
    const normalized = normalizeText(query);
    if (!normalized) return [];
    return this.locations
      .map((location) => ({
        location,
        score: [location.canonicalName, ...location.aliases].reduce((best, name) => {
          const candidate = normalizeText(name);
          if (candidate === normalized) return Math.max(best, 3);
          if (candidate.startsWith(normalized)) return Math.max(best, 2);
          if (candidate.includes(normalized)) return Math.max(best, 1);
          return best;
        }, 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score
        || a.location.canonicalName.localeCompare(b.location.canonicalName, 'en-NZ'))
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map(({ location }) => location);
  }

  searchLocations(query: string, limit?: number): KnownLocation[] {
    return this.search(query, limit);
  }

  resolve(input: string | null): LocationResolution {
    const text = this.normalizeLocationText(input ?? '');
    if (!text) return this.unknown('empty');
    const isRemote = remotePattern.test(text);
    const isHybrid = hybridPattern.test(text);
    const isMultiple = multiplePattern.test(text);
    if (isRemote && !isHybrid) return this.unknown('remote', true);
    if (this.administrativeNames.has(text)) return this.unknown('unparsed');

    const matches: Match[] = [];
    for (const [normalizedInput, index] of [
      [text, this.aliases] as const,
      [normalizeText(input ?? '', { stripMarks: false }), this.markedAliases] as const,
    ]) {
      const words = normalizedInput.split(' ');
      for (let start = 0; start < words.length; start += 1) {
        for (let length = 1; length <= this.maxAliasWords && start + length <= words.length; length += 1) {
          const entries = index.get(words.slice(start, start + length).join(' '));
          if (!entries) continue;
          for (const entry of entries) matches.push({ ...entry, start, end: start + length });
        }
      }
    }
    const longest = matches.filter((match) => !matches.some((other) =>
      other.start <= match.start && other.end >= match.end
      && other.end - other.start > match.end - match.start,
    ));
    const canonicalAvailable = longest.some(({ canonical }) => canonical);
    const useful = canonicalAvailable
      ? longest.filter(({ canonical, start, end }) => canonical || end - start > 1)
      : longest;
    const candidates = [...new Map(useful.map(({ location }) => [location.id, location])).values()]
      .reduce<KnownLocation[]>((result, location) => {
        const duplicateIndex = result.findIndex((candidate) =>
          normalizeText(candidate.canonicalName) === normalizeText(location.canonicalName)
          && haversineDistanceKm(candidate, location) < 25,
        );
        if (duplicateIndex === -1) return [...result, location];
        if (location.uncertaintyKm < result[duplicateIndex]!.uncertaintyKm) {
          result[duplicateIndex] = location;
        }
        return result;
      }, []);
    if (!candidates.length) {
      return this.unknown(isMultiple ? 'multiple-locations' : 'unparsed');
    }

    const eligibleTypes = new Set(['suburb', 'locality', 'town', 'city']);
    const confidence = isMultiple || candidates.length > 1
      ? 'low'
      : candidates[0]!.localityType === 'city'
        ? 'medium'
        : 'high';
    return {
      candidates,
      confidence,
      distanceEligible: !isHybrid && !isMultiple
        && candidates.every(({ localityType }) => eligibleTypes.has(localityType)),
      isRemote,
      isHybrid,
      reason: isMultiple
        ? 'multiple-locations'
        : candidates.length > 1
          ? 'ambiguous'
          : 'resolved',
    };
  }

  resolveLocation(input: string): LocationResolution {
    return this.resolve(input);
  }

  private unknown(
    reason: LocationResolution['reason'],
    isRemote = false,
  ): LocationResolution {
    return {
      candidates: [],
      confidence: 'unknown',
      distanceEligible: false,
      isRemote,
      isHybrid: false,
      reason,
    };
  }
}
