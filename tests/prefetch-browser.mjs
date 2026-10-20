import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-prefetch-'));
const extension = path.join(temporary, 'extension');
const html = await readFile(new URL('./fixtures/prefetch-page.html', import.meta.url), 'utf8');
const errors = [];
let context;
async function until(read, predicate, label) {
  const deadline = Date.now() + 12000;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(`${label}: ${JSON.stringify(value)}`);
}
async function launch() {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(threads|facebook)\.com\//, route => route.fulfill({ contentType: 'text/html', body: html }));
  return context.serviceWorkers()[0] || context.waitForEvent('serviceworker');
}
try {
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  let worker = await launch();
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://www.threads.com/*'] })), false);
  await worker.evaluate(async () => { await chrome.runtime.sendMessage({ type: 'configure', panes: [], sync: false }).catch(() => {}); });
  assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
  console.log('PASS prefetch is not registered without Threads access');
  await context.close(); context = null;
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // Test copy only: native permission prompts are outside browser automation.
  manifest.host_permissions = ['https://www.threads.com/*', 'https://www.facebook.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  worker = await launch();
  const extensionId = new URL(worker.url()).host;
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${extensionId}/myfeeds.html`);
  await until(() => workspace.locator('.pane').count(), count => count === 3, 'workspace ready');
  await workspace.locator('.pane-open').nth(1).click();
  const frame = await until(() => Promise.resolve(workspace.frames().find(f => f.url() === 'https://www.threads.com/')), Boolean, 'Threads frame');
  await until(() => frame.evaluate(() => ({ loads: window.prefetchStats?.loads, margin: window.prefetchStats?.margin,
    ancestors: [...location.ancestorOrigins], marker: window.name, path: location.pathname })), value => value.loads === 1, 'ahead-of-view append');
  const stats = await frame.evaluate(() => ({ ...window.prefetchStats, top: scrollY }));
  assert.equal(stats.margin, '4000px 4000px 6000px 4000px');
  assert.equal(stats.localRoot, true);
  assert.equal(stats.top, 0);
  assert.equal(stats.maxActive, 1);
  assert.equal(stats.nativeCompatibility, true);
  assert.equal(stats.invalidCallbackThrows, true);
  await workspace.waitForTimeout(400);
  assert.equal(await frame.evaluate(() => window.prefetchStats.loads), 1);
  console.log('PASS document-start prefetch fills a bounded buffer without scroll drift or concurrent loads');
  const registrations = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].world, 'MAIN');
  const normal = await context.newPage();
  await normal.goto('https://www.threads.com/');
  assert.equal(await normal.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  await normal.waitForTimeout(250);
  assert.equal(await normal.evaluate(() => window.prefetchStats.loads), 0);
  await normal.evaluate(() => window.name = '3fingers:fake:a-b-c');
  await normal.reload();
  assert.equal(await normal.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  await normal.close();
  const outside = await context.newPage();
  await outside.route('https://outside.example/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Outside workspace</title>' }));
  await outside.goto('https://outside.example/');
  await outside.evaluate(() => {
    const iframe = document.createElement('iframe'); iframe.name = '3fingers:fake:a-b-c';
    iframe.src = 'https://www.threads.com/'; document.body.append(iframe);
  });
  const outsideFrame = await until(() => Promise.resolve(outside.frames().find(f => f.url() === 'https://www.threads.com/')), Boolean, 'outside frame');
  assert.equal(await outsideFrame.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  await outside.close();
  await workspace.locator('.pane-open').first().click();
  const facebook = await until(() => Promise.resolve(workspace.frames().find(f => f.url() === 'https://www.facebook.com/')), Boolean, 'Facebook frame');
  assert.equal(await facebook.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  console.log('PASS normal tabs, forged top-level markers and other social frames retain native observers');
  await frame.goto('https://www.threads.com/unrecognized-route');
  assert.equal(await frame.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  await frame.goto('https://www.threads.com/');
  await until(() => frame.evaluate(() => window.prefetchStats?.loads), value => value === 1, 'navigation restores early prefetch');
  await frame.evaluate(() => { window.prefetchStats.exhausted = true; window.scrollTo(0, document.scrollingElement.scrollHeight); });
  await workspace.waitForTimeout(400);
  assert.equal(await frame.evaluate(() => window.prefetchStats.loads), 1);
  await frame.evaluate(() => { window.prefetchStats.exhausted = false; window.prefetchStats.fail = true; });
  await workspace.waitForTimeout(400);
  assert.equal(await frame.evaluate(() => window.prefetchStats.loads), 1);
  console.log('PASS navigation, native end-of-feed and error guards do not create a retry loop');
  await worker.evaluate(async () => {
    await chrome.scripting.unregisterContentScripts({ ids: ['threads-prefetch'] });
    self.restorePrefetchRegistration = chrome.scripting.registerContentScripts;
    chrome.scripting.registerContentScripts = async () => { throw Error('Registration failure probe'); };
  });
  await workspace.reload();
  const fallback = await until(() => Promise.resolve(workspace.frames().find(f => f.url() === 'https://www.threads.com/')), Boolean, 'fallback frame');
  assert.equal(await fallback.evaluate(() => window.prefetchStats.margin), '4000px 4000px 4000px 4000px');
  assert.equal(await workspace.locator('#workspace-status').innerText(), '');
  await worker.evaluate(() => { chrome.scripting.registerContentScripts = self.restorePrefetchRegistration; delete self.restorePrefetchRegistration; });
  console.log('PASS registration failure keeps the workspace usable with native pagination');
  await context.close(); context = null;
  delete manifest.host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest));
  worker = await launch();
  // Once access is optional again, revoke any retained grant and await cleanup.
  await worker.evaluate(() => chrome.permissions.remove({ origins: ['https://www.threads.com/*'] }));
  await until(() => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), scripts => scripts.length === 0, 'revoked registration removed');
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://www.threads.com/*'] })), false);
  assert.deepEqual(errors, []);
  console.log('PASS permission revocation removes registration and no uncaught page errors occur');
} finally {
  const cleanupErrors = [];
  if (context) await context.close().catch(error => cleanupErrors.push(error));
  assert.equal(path.dirname(temporary), path.resolve(tmpdir()));
  assert(path.basename(temporary).startsWith('3fingers-prefetch-'));
  await rm(temporary, { recursive: true, force: true }).catch(error => cleanupErrors.push(error));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Prefetch browser cleanup failed');
}
