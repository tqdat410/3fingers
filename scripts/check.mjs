import { readFile, access, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
assert.equal(manifest.version, packageInfo.version);
assert.equal(lockfile.version, packageInfo.version);
assert.equal(lockfile.packages[''].version, packageInfo.version);
assert.equal(packageInfo.license, 'GPL-3.0-only');
assert.equal(lockfile.packages[''].license, packageInfo.license);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
const escapedVersion = manifest.version.replaceAll('.', '\\.');
const betaVersionName = new RegExp(`^${escapedVersion}-beta\\.[1-9]\\d*$`);
assert(manifest.version_name === manifest.version || betaVersionName.test(manifest.version_name));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, 'module');
assert(!manifest.permissions.includes('cookies'));
assert.deepEqual(manifest.optional_permissions, ['cookies']);
assert(!manifest.permissions.includes('debugger'));
for (const path of [manifest.background.service_worker, 'workspace.html', 'workspace.js', 'workspace.css', 'content.js', 'feed-chrome.css', 'threads-prefetch.js', 'popup.html', 'popup.js', 'popup.css', 'shared/social-theme.js', 'shared/site-csrf.js', 'shared/ui-theme.js', 'shared/workspace-tabs.js']) await access(`extension/${path}`);
assert.equal(manifest.action.default_popup, undefined);
const html = await readFile('extension/workspace.html', 'utf8') + await readFile('extension/popup.html', 'utf8');
for (const [, path] of html.matchAll(/(?:src|href)="([^":]+)"/g)) await access(`extension/${path}`);
for (const [size, path] of Object.entries(manifest.icons)) {
  const png = await readFile(`extension/${path}`);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), Number(size));
  assert.equal(png.readUInt32BE(20), Number(size));
  assert.equal(png[25], 6, 'PNG icons must retain transparency');
}
for (const path of Object.values(manifest.action.default_icon)) await access(`extension/${path}`);
const css = await readFile('extension/workspace.css', 'utf8');
assert(css.includes('--brand-primary:#1c1c1c'));
assert(!/url\(["']?https?:/i.test(css), 'Bundle fonts and assets locally');
for (const [, path] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) await access(`extension/${path}`);
for (const weight of ['Regular', 'Medium', 'Bold']) {
  const font = await readFile(`extension/assets/fonts/Ubuntu-${weight}.ttf`);
  assert.equal(font.readUInt32BE(0), 0x00010000);
}
assert((await readFile('LICENSE', 'utf8')).includes('Version 3, 29 June 2007'));
assert((await readFile('extension/assets/fonts/UFL.txt', 'utf8')).includes('UBUNTU FONT LICENCE Version 1.0'));
await access('extension/assets/fonts/COPYRIGHT.txt');
await access('extension/NOTICE.txt');
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(?:m?js)$/.test(path)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  }
}
await check('extension');
console.log('Manifest, versions, icons, local fonts, licenses and JavaScript syntax OK.');
