import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'public/data/locations/nz');
const MANUAL_ALIASES = resolve(ROOT, 'data/locations/nz/aliases.manual.json');
const SOURCE_URL = 'https://data.linz.govt.nz/layer/113764-nz-suburbs-and-localities/';
const SERVICE_URL = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Suburbs_and_Localities/FeatureServer/0';
const ITEM_URL = 'https://www.arcgis.com/sharing/rest/content/items/cfe52bdf2a76491d86c4f433957f2460?f=json';
const LICENCE = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';
const ATTRIBUTION = 'Contains data sourced from Toitū Te Whenua Land Information New Zealand, licensed for reuse under CC BY 4.0.';
const ALLOWED_TYPES = new Set(['Suburb', 'Locality', 'Island']);
const SOURCE_FIELDS = [
  'id', 'name', 'additional_name', 'type', 'major_name', 'major_name_type',
  'territorial_authority', 'population_estimate', 'name_ascii',
  'additional_name_ascii', 'major_name_ascii', 'territorial_authority_ascii',
].join(',');
const EXPECTED_REGIONS = {
  Northland: 'Whangārei', Auckland: 'Auckland', Waikato: 'Hamilton',
  'Bay of Plenty': 'Tauranga', Gisborne: 'Gisborne', "Hawke's Bay": 'Napier',
  Taranaki: 'New Plymouth', 'Manawatū-Whanganui': 'Palmerston North',
  Wellington: 'Wellington', Tasman: 'Richmond', Nelson: 'Nelson',
  Marlborough: 'Blenheim', 'West Coast': 'Greymouth', Canterbury: 'Christchurch',
  Otago: 'Dunedin', Southland: 'Invercargill',
};

const round = (value, places) => Number(value.toFixed(places));
const normalize = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-NZ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];
const splitNames = (value) => value
  ? unique([value.trim(), ...value.split(/\s+\/\s+|\s*,\s*/).map((name) => name.trim())])
  : [];

function haversine(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function representativePoint(polygon) {
  const ring = polygon[0];
  const area = ringArea(ring);
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const cross = ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    x += (ring[index][0] + ring[index + 1][0]) * cross;
    y += (ring[index][1] + ring[index + 1][1]) * cross;
  }
  const centroid = Math.abs(area) > Number.EPSILON ? [x / (6 * area), y / (6 * area)] : ring[0];
  if (pointInPolygon(centroid, polygon)) return centroid;

  const ys = ring.map(([, latitude]) => latitude);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best = null;
  for (let row = 0; row < 64; row += 1) {
    const candidateY = minY + (row + 0.5) * (maxY - minY) / 64;
    const intersections = [];
    for (let index = 0; index < ring.length - 1; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[index + 1];
      if ((y1 > candidateY) !== (y2 > candidateY)) intersections.push(x1 + (candidateY - y1) * (x2 - x1) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const candidate = [(intersections[index] + intersections[index + 1]) / 2, candidateY];
      const width = intersections[index + 1] - intersections[index];
      if (pointInPolygon(candidate, polygon) && (!best || width > best.width)) best = { point: candidate, width };
    }
  }
  if (!best) throw new Error('Could not derive a point inside a polygon');
  return best.point;
}

function geometrySummary(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygon = polygons.reduce((largest, candidate) =>
    Math.abs(ringArea(candidate[0])) > Math.abs(ringArea(largest[0])) ? candidate : largest,
  );
  const [longitude, latitude] = representativePoint(polygon);
  const point = { latitude, longitude };
  const uncertaintyKm = Math.max(...polygons.flat(2).map(([lon, lat]) =>
    haversine(point, { latitude: lat, longitude: lon }),
  ));
  return { point, uncertaintyKm: Math.max(0.1, Math.ceil(uncertaintyKm * 10) / 10) };
}

function contextualNames(name, contexts) {
  return unique(contexts.flatMap((context) => {
    const shortened = context.replace(/\s+(City|District|Territory)$/i, '');
    return [`${name}, ${context}`, shortened === context ? '' : `${name}, ${shortened}`];
  }));
}

function localityType(sourceType) {
  if (sourceType === 'Suburb') return 'suburb';
  if (sourceType === 'City') return 'city';
  if (sourceType === 'Town') return 'town';
  return 'locality';
}

function medoid(members) {
  return members.reduce((best, candidate) => {
    const maximum = Math.max(...members.map((member) => haversine(candidate.point, member.point) + member.uncertaintyKm));
    return !best || maximum < best.maximum ? { ...candidate, maximum } : best;
  }, null);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}`);
  return response.json();
}

async function downloadSource() {
  const downloadedAt = new Date().toISOString();
  const [metadata, item] = await Promise.all([
    fetchJson(`${SERVICE_URL}?f=pjson`),
    fetchJson(ITEM_URL),
  ]);
  if (!String(item.licenseInfo).includes('Creative Commons Attribution 4.0 International')) {
    throw new Error('The live source licence no longer matches the reviewed CC BY 4.0 licence');
  }
  const count = (await fetchJson(`${SERVICE_URL}/query?where=1%3D1&returnCountOnly=true&f=json`)).count;
  const directory = await mkdtemp(join(tmpdir(), 'jobfilter-linz-'));
  const paths = [];
  for (let offset = 0; offset < count; offset += 2000) {
    const query = new URLSearchParams({
      where: '1=1',
      outFields: SOURCE_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: '2000',
      orderByFields: 'OBJECTID',
    });
    const response = await fetch(`${SERVICE_URL}/query?${query}`);
    if (!response.ok) throw new Error(`Source page ${offset} failed: HTTP ${response.status}`);
    const path = join(directory, `nz-localities-${offset}.geojson`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    paths.push(path);
  }
  return {
    directory,
    paths,
    downloadedAt,
    sourceVersion: `ArcGIS dataLastEditDate ${new Date(metadata.editingInfo.lastEditDate).toISOString()}; downloaded ${downloadedAt.slice(0, 10)}`,
  };
}

async function main() {
  const startedAt = performance.now();
  const suppliedPaths = process.argv.slice(2).map((sourcePath) => resolve(sourcePath));
  const download = suppliedPaths.length ? null : await downloadSource();
  const sourcePaths = suppliedPaths.length ? suppliedPaths : download.paths;
  const manualAliases = JSON.parse(await readFile(MANUAL_ALIASES, 'utf8'));
  const aliasesById = new Map(manualAliases.map(({ sourceId, aliases }) => [sourceId, aliases]));
  const hash = createHash('sha256');
  const locations = [];
  const majorGroups = new Map();
  const sourceTypeCounts = {};
  let sourceRecordCount = 0;
  let rawBytes = 0;

  for (const sourcePath of sourcePaths) {
    const raw = await readFile(sourcePath);
    rawBytes += raw.byteLength;
    hash.update(raw);
    const data = JSON.parse(raw);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error(`${basename(sourcePath)} is not GeoJSON`);
    for (const feature of data.features) {
      const properties = feature.properties;
      sourceRecordCount += 1;
      sourceTypeCounts[properties.type] = (sourceTypeCounts[properties.type] ?? 0) + 1;
      if (!ALLOWED_TYPES.has(properties.type)) continue;
      if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error(`Unsupported geometry for ${properties.id}`);
      const { point, uncertaintyKm } = geometrySummary(feature.geometry);
      const contexts = unique(splitNames(properties.major_name).concat(splitNames(properties.territorial_authority)));
      const aliases = unique([
        ...splitNames(properties.name),
        ...splitNames(properties.name_ascii),
        ...splitNames(properties.additional_name),
        ...splitNames(properties.additional_name_ascii),
        ...contextualNames(properties.name, contexts),
        ...(aliasesById.get(properties.id) ?? []),
      ]).filter((name) => name !== properties.name);
      locations.push({
        id: `linz-${properties.id}`,
        canonicalName: properties.name,
        majorName: properties.major_name || null,
        aliases,
        latitude: round(point.latitude, 5),
        longitude: round(point.longitude, 5),
        uncertaintyKm,
        localityType: localityType(properties.type),
        regionCode: properties.territorial_authority || null,
        countryCode: 'NZ',
      });
      if (properties.major_name) {
        const key = `${properties.major_name}\0${properties.major_name_type}`;
        const group = majorGroups.get(key) ?? [];
        group.push({ point, uncertaintyKm, properties });
        majorGroups.set(key, group);
      }
    }
  }

  for (const [key, members] of majorGroups) {
    const [name, sourceType] = key.split('\0');
    const centre = medoid(members);
    const contexts = unique(members.flatMap(({ properties }) => splitNames(properties.territorial_authority)));
    const asciiNames = unique(members.flatMap(({ properties }) => splitNames(properties.major_name_ascii)));
    const idPart = normalize(name).replaceAll(' ', '-');
    locations.push({
      id: `linz-major-${idPart}-${normalize(sourceType).replaceAll(' ', '-')}`,
      canonicalName: name,
      majorName: null,
      aliases: unique([...asciiNames, ...contextualNames(name, contexts)])
        .filter((alias) => alias !== name),
      latitude: round(centre.point.latitude, 5),
      longitude: round(centre.point.longitude, 5),
      uncertaintyKm: Math.max(0.1, Math.ceil(centre.maximum * 10) / 10),
      localityType: localityType(sourceType),
      regionCode: contexts.length === 1 ? contexts[0] : null,
      countryCode: 'NZ',
    });
  }

  locations.sort((a, b) => a.id.localeCompare(b.id));
  const duplicateIds = locations.filter((location, index) => locations.findIndex(({ id }) => id === location.id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate output IDs: ${duplicateIds.map(({ id }) => id).join(', ')}`);
  const normalizedNames = new Set(locations.flatMap(({ canonicalName, aliases }) =>
    [canonicalName, ...aliases].map(normalize),
  ));
  const regionCoverage = Object.fromEntries(Object.entries(EXPECTED_REGIONS).map(([region, representative]) => [region, {
    representative,
    covered: normalizedNames.has(normalize(representative)),
  }]));
  const islandCoverage = {
    northIsland: normalizedNames.has('auckland'),
    southIsland: normalizedNames.has('christchurch'),
    rakiura: normalizedNames.has('rakiura'),
    chathamIslands: normalizedNames.has('chatham island'),
  };
  if (Object.values(regionCoverage).some(({ covered }) => !covered) || Object.values(islandCoverage).includes(false)) throw new Error('Nationwide coverage assertion failed');

  const downloadedAt = process.env.JOBFILTER_SOURCE_DOWNLOADED_AT
    ?? download?.downloadedAt
    ?? new Date().toISOString();
  const sourceVersion = process.env.JOBFILTER_SOURCE_VERSION
    ?? download?.sourceVersion
    ?? `downloaded-${downloadedAt.slice(0, 10)}`;
  const dataset = {
    format: 'jobfilter-nz-locations',
    schemaVersion: 1,
    dataVersion: sourceVersion,
    locations,
  };
  const datasetText = `${JSON.stringify(dataset)}\n`;
  const indexStartedAt = performance.now();
  const aliasIndex = new Map();
  let maxAliasWords = 1;
  for (const location of locations) {
    for (const name of [location.canonicalName, ...location.aliases]) {
      const alias = normalize(name);
      maxAliasWords = Math.max(maxAliasWords, alias.split(' ').length);
      const entries = aliasIndex.get(alias) ?? [];
      entries.push(location.id);
      aliasIndex.set(alias, entries);
    }
  }
  const coldIndexMilliseconds = performance.now() - indexStartedAt;
  const lookup = (query) => {
    const words = normalize(query).split(' ');
    const matches = new Set();
    for (let start = 0; start < words.length; start += 1) {
      for (let length = 1; length <= maxAliasWords && start + length <= words.length; length += 1) {
        for (const id of aliasIndex.get(words.slice(start, start + length).join(' ')) ?? []) matches.add(id);
      }
    }
    return matches.size;
  };
  const benchmark = (query) => {
    const benchmarkStartedAt = performance.now();
    for (let count = 0; count < 1000; count += 1) lookup(query);
    return round(performance.now() - benchmarkStartedAt, 2);
  };
  const manifest = {
    id: 'nz-locations',
    countryCode: 'NZ',
    format: 'jobfilter-location-manifest',
    schemaVersion: 1,
    version: sourceVersion,
    generatedAt: downloadedAt,
    attribution: ATTRIBUTION,
    sources: [{
      name: 'LINZ NZ Suburbs and Localities (layer 113764)',
      url: SOURCE_URL,
      serviceUrl: SERVICE_URL,
      version: sourceVersion,
      downloadedAt,
      licence: LICENCE,
      sha256: hash.digest('hex'),
      hashMethod: 'SHA-256 of the ordered GeoJSON page bytes concatenated without separators',
    }],
    sourceRecordCount,
    excludedRecordCount: sourceRecordCount - locations.filter(({ id }) =>
      id.startsWith('linz-') && !id.startsWith('linz-major-'),
    ).length,
    locationCount: locations.length,
  };
  const report = {
    sourceRecordCount,
    outputLocationCount: locations.length,
    sourceTypeCounts,
    regionCoverage,
    islandCoverage,
    rawBytes,
    compactBytes: Buffer.byteLength(datasetText),
    buildMilliseconds: round(performance.now() - startedAt, 1),
    queryBenchmark: {
      repetitions: 1000,
      coldIndexMilliseconds: round(coldIndexMilliseconds, 2),
      typicalQuery: { input: 'Hamilton Central, Waikato', milliseconds: benchmark('Hamilton Central, Waikato') },
      duplicateNameQuery: { input: 'Richmond', milliseconds: benchmark('Richmond') },
    },
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(resolve(OUTPUT_DIR, 'locations.compact.json'), datasetText),
    writeFile(resolve(OUTPUT_DIR, 'dataset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(OUTPUT_DIR, 'coverage-report.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(resolve(OUTPUT_DIR, 'ATTRIBUTION.md'), `# NZ location data attribution\n\n${ATTRIBUTION}\n\nData has been filtered, normalised and supplemented with aliases. Polygon geometry was converted to an interior representative point and a conservative covering radius; raw polygons are not distributed.\n\n- Source: ${SOURCE_URL}\n- Data version: ${sourceVersion}\n- Downloaded: ${downloadedAt}\n- Licence: ${LICENCE}\n`),
  ]);
  if (download) await rm(download.directory, { recursive: true });
  console.log(`Built ${locations.length} runtime locations from ${sourceRecordCount} source records (${Buffer.byteLength(datasetText)} bytes).`);
}

await main();
