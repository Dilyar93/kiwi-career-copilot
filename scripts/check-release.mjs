import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const expectedPermissions = ['geolocation', 'sidePanel', 'storage'];
const expectedIcons = {
  16: 'icon-16.png',
  32: 'icon-32.png',
  48: 'icon-48.png',
  128: 'icon-128.png',
};
const expectedMatches = [
  'https://nz.seek.com/*',
  'https://www.seek.co.nz/*',
];
const sitePages = [
  'index.html', 'privacy.html', 'terms.html', 'support.html', 'contact.html',
  'changelog.html', 'data-deletion.html', 'attribution.html',
  'known-limitations.html',
];
const chromeStoreFiles = [
  'listing.en-NZ.md',
  'privacy-practices.md',
  'README.md',
];

async function assertPngSize(path, width, height) {
  const image = await readFile(path);
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), width);
  assert.equal(image.readUInt32BE(20), height);
}

async function findNamedFiles(directory, name) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findNamedFiles(path, name);
    return entry.name === name ? [path] : [];
  }))).flat();
}

async function manifestCheck(target) {
  const directory = resolve(ROOT, `.output/${target}-mv3`);
  const manifestPaths = (await findNamedFiles(directory, 'manifest.json'))
    .map((path) => path.slice(directory.length + 1))
    .sort();
  assert.deepEqual(manifestPaths, ['manifest.json'], `${target} build contains multiple manifests`);
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.8.0');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.equal(manifest.side_panel?.default_path, 'sidepanel.html');
  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action?.default_icon, {
    16: 'icon-16.png',
    32: 'icon-32.png',
  });
  assert.deepEqual([...manifest.permissions].sort(), expectedPermissions);
  assert.ok(!manifest.host_permissions?.length);
  assert.ok(!manifest.optional_permissions?.length);
  assert.ok(!manifest.optional_host_permissions?.length);
  const matches = manifest.content_scripts.flatMap(({ matches }) => matches).sort();
  assert.deepEqual(matches, expectedMatches);
  assert.ok(!JSON.stringify(manifest).includes('https://*/*'));

  for (const script of ['seek.js']) {
    const source = await readFile(resolve(directory, 'content-scripts', script), 'utf8');
    assert.ok(!source.includes('fetch('), `${target}/${script} must not fetch`);
    assert.ok(!source.includes('XMLHttpRequest'), `${target}/${script} must not use XHR`);
  }
  return { target, version: manifest.version, permissions: manifest.permissions, matches };
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.output')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const manifests = await Promise.all([
  manifestCheck('chrome'),
  manifestCheck('edge'),
]);
const files = (await Promise.all(
  ['entrypoints', 'src', 'scripts', 'tests'].map((directory) =>
    sourceFiles(resolve(ROOT, directory)),
  ),
)).flat();
const sources = await Promise.all(files
  .filter((path) => path !== import.meta.filename)
  .map(async (path) => [path, await readFile(path, 'utf8')]));
for (const [path, source] of sources) {
  assert.ok(!/\beval\s*\(/.test(source), `${path} contains eval`);
  assert.ok(!/\bnew\s+Function\b/.test(source), `${path} contains new Function`);
}
const geolocationCalls = sources.filter(([, source]) =>
  source.includes('navigator.geolocation.getCurrentPosition'),
);
assert.deepEqual(geolocationCalls.map(([path]) => path), [
  resolve(ROOT, 'entrypoints/sidepanel/App.tsx'),
]);
const sidePanelSource = geolocationCalls[0][1];
assert.match(sidePanelSource, /enableHighAccuracy:\s*false/);
assert.match(sidePanelSource, /timeout:\s*10_000/);
assert.match(sidePanelSource, /maximumAge:\s*5\s*\*\s*60\s*\*\s*1000/);

for (const page of sitePages) {
  const html = await readFile(resolve(ROOT, 'site', page), 'utf8');
  assert.match(html, /<html lang="en-NZ">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<h1>/);
  assert.doesNotMatch(html, /internal-review|internal preview|not available for public distribution/i);
}
assert.match(
  await readFile(resolve(ROOT, 'site/privacy.html'), 'utf8'),
  /Chrome Web Store User Data Policy, including the Limited Use requirements/,
);
for (const file of chromeStoreFiles) {
  assert.ok((await readFile(resolve(ROOT, 'store/chrome', file), 'utf8')).trim());
}
await Promise.all([
  assertPngSize(resolve(ROOT, 'store/chrome/assets/store-icon-128.png'), 128, 128),
  assertPngSize(resolve(ROOT, 'store/chrome/assets/screenshot-overview-640x400.png'), 640, 400),
  assertPngSize(resolve(ROOT, 'store/chrome/assets/screenshot-filters-640x400.png'), 640, 400),
  assertPngSize(resolve(ROOT, 'store/chrome/assets/small-promo-440x280.png'), 440, 280),
]);
const [chromeZip, chromeBuild] = await Promise.all([
  stat(resolve(ROOT, '.output/job-filter-extension-0.8.0-chrome.zip')),
  stat(resolve(ROOT, '.output/chrome-mv3/manifest.json')),
]);
assert.ok(chromeZip.mtimeMs >= chromeBuild.mtimeMs, 'Chrome ZIP is older than the build');

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  internalChecks: 'passed',
  releaseEligible: true,
  manifests,
  submissionActions: [
    'Deploy site/ to public HTTPS hosting and enter its privacy/support URLs.',
    'Set a monitored publisher contact in the Chrome Web Store Developer Dashboard.',
    'Paste the prepared listing and privacy-practices answers into the dashboard.',
    'Complete a final smoke test on the current live supported pages before submission.',
  ],
}, null, 2));
