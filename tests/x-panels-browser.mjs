import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-x-panels-'));
let context;
const errors = [];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(read, predicate, label) {
  let value;
  for (let i = 0; i < 120; i++) {
    value = await read();
    if (predicate(value)) return value;
    await wait(100);
  }
  throw Error(`${label}: ${JSON.stringify(value)}`);
}
const extension = path.join(temporary, 'extension');
async function launch() {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/(?:x\.com|www\.facebook\.com)\//, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><main style="height:12000px">Native feed fixture</main>',
  }));
  return context.serviceWorkers()[0] || context.waitForEvent('serviceworker');
}
try {
  await cp('extension', extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.permissions.push('cookies');
  manifest.host_permissions = ['https://x.com/*', 'https://api.x.com/*', 'https://www.facebook.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  let worker = await launch();
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const panes = [
    { id: 'x', url: 'https://x.com/', enabled: true, pinned: false, theme: 'site' },
    { id: 'peer', url: 'https://www.facebook.com/', enabled: true, pinned: false, theme: 'site' },
    { id: 'duplicate', url: 'https://x.com/home', enabled: true, pinned: true, theme: 'site' },
  ];
  await worker.evaluate(panes => chrome.storage.local.set({ workspace: { panes } }), panes);
  let page = await context.newPage();
  await page.goto(`${root}/workspace.html`);
  await until(() => page.locator('.pane[data-status="permission"]').count(), count => count === 2, 'API grant blocks X only');
  await until(() => page.locator('.pane[data-pane-id="peer"]').getAttribute('data-status'), status => status === 'connected', 'peer connects despite X conflict');
  assert((await page.locator('.pane[data-pane-id="x"] .pane-status-text').innerText()).includes('api.x.com'));
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://api.x.com/*'] })), true);
  assert.equal(await page.locator('iframe').count(), 1);
  console.log('PASS pre-existing API or broader access blocks only X with a clear message and never revokes user access');

  // Bootstrap real grants, then move them to optional permissions for real revocation.
  await context.close(); context = null;
  manifest.permissions = manifest.permissions.filter(permission => permission !== 'cookies');
  manifest.host_permissions = ['https://www.facebook.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  worker = await launch();
  assert.equal(await worker.evaluate(() => chrome.permissions.remove({ origins: ['https://api.x.com/*'] })), true);
  await context.addCookies([{ name: 'ct0', value: 'fixture-x-one', domain: '.x.com', path: '/', sameSite: 'Lax', secure: true }]);
  page = await context.newPage();
  await page.goto(`${root}/workspace.html`);
  const pane = id => page.locator(`.pane[data-pane-id="${id}"]`);
  for (const id of ['x', 'duplicate']) await pane(id).locator('.pane-open').click();
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'X panels connect after explicit Open');
  const xFrames = () => page.frames().filter(frame => frame.url().startsWith('https://x.com/'));
  let x = xFrames()[0];
  const duplicate = xFrames()[1];
  const peer = page.frames().find(frame => frame.url().startsWith('https://www.facebook.com/'));
  for (const frame of xFrames()) {
    assert.equal(frame.url(), 'https://x.com/home?lang=');
    assert.deepEqual(await frame.evaluate(() => ({
      own: Object.hasOwn(document, 'cookie'), token: document.cookie.includes('ct0=fixture-x-one'),
      native: /(?:^|;\s*)ct0=/.test(Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get.call(document)),
    })), { own: true, token: true, native: false });
  }
  const normal = await context.newPage();
  await normal.goto('https://x.com/home');
  assert.equal(await normal.evaluate(() => Object.hasOwn(document, 'cookie')), false);
  assert.equal(await peer.evaluate(() => Object.hasOwn(document, 'cookie')), false);
  await peer.evaluate(() => { window.documentIdentity = 'peer-document'; });
  assert.equal(await pane('x').locator('.pane-theme').isDisabled(), true);
  assert.equal(await x.evaluate(() => document.fullscreenEnabled), false);
  console.log('PASS X opens its compatible URL, duplicates get a missing-Lax-cookie fallback, normal tabs and peers stay native');

  await page.bringToFront();
  const positions = () => Promise.all([x, peer, duplicate].map(frame => frame.evaluate(() => document.scrollingElement.scrollTop)));
  async function wheel(id, delta) {
    const box = await pane(id).locator('iframe').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 300);
    await page.mouse.wheel(0, delta);
  }
  await wheel('x', 250);
  await until(positions, values => values[0] > 100 && values[1] > 100, 'X sends sync');
  assert.equal((await positions())[2], 0);
  const before = await positions();
  await wheel('peer', 220);
  await until(positions, values => values[0] > before[0] + 80, 'X follows peer');
  await pane('x').locator('.pane-drag-handle').click();
  await wait(250);
  const pinned = await positions();
  await wheel('peer', 220);
  await until(positions, values => values[1] > pinned[1] + 80, 'peer scrolls while X pinned');
  assert.equal((await positions())[0], pinned[0]);
  await pane('x').locator('.pane-drag-handle').click();
  await wait(250);
  const local = await positions(), box = await pane('x').locator('iframe').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 600);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 300, { steps: 12 });
  await page.mouse.up();
  await until(positions, values => values[0] > local[0] + 80, 'X local drag');
  assert.equal((await positions())[1], local[1]);
  await pane('x').locator('.pane-drag-handle').focus();
  await page.keyboard.press('ArrowRight');
  await until(() => page.locator('.pane').evaluateAll(nodes => nodes.map(node => node.dataset.paneId)), ids => ids.join(',') === 'peer,x,duplicate', 'X reordered');
  assert.equal(await peer.evaluate(() => window.documentIdentity), 'peer-document');
  console.log('PASS X syncs both ways, respects pins and local drag, and reorders without replacing peer documents');

  await x.evaluate(() => history.pushState({}, '', '/profile-test?ref=fixture'));
  await x.evaluate(() => history.pushState({}, '', '/fixture/status/123'));
  await until(() => pane('x').locator('.pane-back').isEnabled(), Boolean, 'X records SPA history');
  await pane('x').locator('.pane-back').click();
  await until(() => x.url(), url => url === 'https://x.com/profile-test?ref=fixture&lang=', 'Back preserves path and adds cache bypass');
  await until(() => pane('x').getAttribute('data-status'), status => status === 'connected', 'X Back reconnects');
  await until(() => worker.evaluate(async () => Object.values((await chrome.storage.session.get('sessions')).sessions).flatMap(session => session.panes.filter(pane => pane.id === 'x').map(pane => pane.history))), histories => histories[0]?.length === 2, 'Back does not duplicate history');
  assert.equal(await peer.evaluate(() => window.documentIdentity), 'peer-document');
  await pane('x').locator('.pane-reload').click();
  await until(() => page.frames().find(frame => frame !== x && frame.name().startsWith('3fingers:x:')), Boolean, 'X gets its replacement frame');
  x = page.frames().find(frame => frame !== x && frame.name().startsWith('3fingers:x:'));
  await until(() => x.url(), url => url === 'https://x.com/home?lang=', 'reload keeps compatible Home');
  await until(() => pane('x').getAttribute('data-status'), status => status === 'connected', 'X reload connects');
  assert.equal(await peer.evaluate(() => window.documentIdentity), 'peer-document');
  console.log('PASS X toolbar Back preserves route/query without duplicate history, and reload preserves peers and compatible entry');

  await worker.evaluate(() => chrome.cookies.set({ url: 'https://x.com/', name: 'ct0', value: 'fixture-x-two', domain: '.x.com', path: '/', secure: true, sameSite: 'lax' }));
  for (const frame of xFrames()) await until(() => frame.evaluate(() => document.cookie.includes('ct0=fixture-x-two')), Boolean, 'X token changes reach current documents');
  await x.evaluate(() => { const child = document.createElement('iframe'); child.src = '/nested'; document.body.append(child); });
  await until(() => x.childFrames().length, count => count === 1, 'nested X document loads');
  assert.equal(await x.childFrames()[0].evaluate(() => Object.hasOwn(document, 'cookie')), false);
  await x.evaluate(() => document.querySelector('iframe').remove());
  await x.evaluate(() => { document.cookie = 'reader_preference=yes; SameSite=None; Secure; path=/'; });
  assert((await context.cookies('https://x.com/')).some(cookie => cookie.name === 'reader_preference' && cookie.value === 'yes'));
  assert((await context.cookies('https://x.com/')).some(cookie => cookie.name === 'ct0' && cookie.sameSite === 'Lax'));
  await worker.evaluate(() => chrome.cookies.set({ url: 'https://x.com/', name: 'ct0', value: 'fixture-x-visible', domain: '.x.com', path: '/', secure: true, sameSite: 'no_restriction' }));
  for (const frame of xFrames()) {
    await until(() => frame.evaluate(() => Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get.call(document).includes('ct0=fixture-x-visible')), Boolean, 'native readable token takes precedence');
    assert.equal(await frame.evaluate(() => document.cookie.split(';').filter(part => part.trim().startsWith('ct0=')).length), 1);
  }
  await worker.evaluate(() => chrome.cookies.set({ url: 'https://x.com/', name: 'ct0', value: 'fixture-x-expiring', domain: '.x.com', path: '/', secure: true, sameSite: 'lax', expirationDate: Date.now() / 1000 + 2 }));
  for (const frame of xFrames()) await until(() => frame.evaluate(() => document.cookie.includes('ct0=fixture-x-expiring')), Boolean, 'X expiring token reaches current documents');
  for (const frame of xFrames()) await until(() => frame.evaluate(() => !document.cookie.includes('ct0=')), Boolean, 'X expiration clears fallback');
  await worker.evaluate(() => chrome.cookies.set({ url: 'https://x.com/', name: 'ct0', value: 'fixture-x-two', domain: '.x.com', path: '/', secure: true, sameSite: 'lax' }));
  const storage = await worker.evaluate(async () => JSON.stringify([await chrome.storage.local.get(null), await chrome.storage.session.get(null)]));
  assert(!storage.includes('fixture-x-'));
  await pane('duplicate').locator('.pane-close').click();
  const popup = await context.newPage();
  await popup.goto(`${root}/popup.html`);
  await popup.evaluate(() => {
    window.actualRequest = chrome.permissions.request;
    chrome.permissions.request = async details => { window.requestedPermissions = details; return false; };
  });
  await popup.locator('#add-panel').click();
  await popup.locator('.social-option[data-site="X"]').click();
  await until(() => popup.locator('#popup-status').innerText(), text => text === 'Site access denied.', 'X permission denied');
  assert.deepEqual(await popup.evaluate(() => window.requestedPermissions), { origins: ['https://x.com/*'], permissions: ['cookies'] });
  assert.equal(await page.locator('.pane').count(), 2);
  await popup.evaluate(() => { chrome.permissions.request = window.actualRequest; });
  await popup.locator('#add-panel').click();
  await popup.locator('.social-option[data-site="X"]').click();
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'X added through popup');
  assert.equal(await popup.locator('#add-panel').isDisabled(), true);
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://api.x.com/*'] })), false);
  assert.equal(await worker.evaluate(() => chrome.permissions.remove({ permissions: ['cookies'] })), true);
  await until(() => page.locator('.pane[data-status="permission"]').count(), count => count === 2, 'cookie revocation removes X only');
  assert.equal(await pane('peer').getAttribute('data-status'), 'connected');
  assert.deepEqual(errors, []);
  console.log('PASS X uses exact optional permissions, denial preserves layout, refresh never persists tokens and revocation removes only X');
} finally {
  await context?.close();
  assert.equal(path.dirname(temporary), tmpdir());
  assert(path.basename(temporary).startsWith('3fingers-x-panels-'));
  await rm(temporary, { recursive: true, force: true });
}
