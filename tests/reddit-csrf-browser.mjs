import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-reddit-csrf-'));
let context;
const errors = [];
const until = async (read, predicate, label) => {
  for (let i = 0; i < 120; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(label);
};
try {
  const extension = path.join(temporary, 'extension');
  await cp('extension', extension, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  manifest.permissions.push('cookies');
  manifest.host_permissions = ['https://www.reddit.com/*', 'https://reddit.com/*', 'https://www.facebook.com/*'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(reddit|facebook)\.com\//, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><main style="height:4000px">Feed</main>',
  }));
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const panes = ['reddit', 'facebook', 'reddit'].map((site, index) => ({
    id: `pane-${index}`, url: `https://www.${site}.com/`, enabled: true, pinned: index === 2, theme: 'site',
  }));
  // These are synthetic test-only values, never real account cookies.
  await context.addCookies([{ name: 'csrf_token', value: 'fixture-one', domain: '.reddit.com', path: '/', secure: true, sameSite: 'Strict' }]);
  await worker.evaluate(panes => chrome.storage.local.set({ workspace: { panes } }), panes);
  // Chrome's approval bubble is outside Playwright. Move the initial bootstrap
  // grants to optional permissions in the same profile to test real revocation.
  await context.close(); context = null;
  manifest.permissions = manifest.permissions.filter(permission => permission !== 'cookies');
  manifest.host_permissions = ['https://www.facebook.com/*'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(reddit|facebook)\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><main style="height:4000px">Feed</main>' }));
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.addCookies([{ name: 'csrf_token', value: 'fixture-one', domain: '.reddit.com', path: '/', secure: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  await page.goto(`${root}/workspace.html`);
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'all panes connect');
  const redditFrames = () => page.frames().filter(frame => frame.url().startsWith('https://www.reddit.com/'));
  const hasToken = (frame, value) => frame.evaluate(expected => document.cookie.includes(`csrf_token=${expected}`), value);
  for (const frame of redditFrames()) {
    assert(await hasToken(frame, 'fixture-one'));
    assert.deepEqual(await frame.evaluate(() => ({
      ownAccessor: Object.hasOwn(document, 'cookie'),
      nativeHasToken: /(?:^|;\s*)csrf_token=/.test(Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get.call(document)),
    })), { ownAccessor: true, nativeHasToken: false });
  }
  const normal = await context.newPage();
  await normal.goto('https://www.reddit.com/');
  assert.equal(await normal.evaluate(() => Object.hasOwn(document, 'cookie')), false);
  const peer = page.frames().find(frame => frame.url().startsWith('https://www.facebook.com/'));
  assert.equal(await peer.evaluate(() => Object.hasOwn(document, 'cookie')), false);
  console.log('PASS Strict CSRF cookie is supplied to registered Reddit documents only, including duplicates');

  await worker.evaluate(() => chrome.cookies.set({ url: 'https://www.reddit.com/', name: 'csrf_token', value: 'fixture-two', domain: '.reddit.com', path: '/', secure: true, sameSite: 'strict' }));
  for (const frame of redditFrames()) await until(() => hasToken(frame, 'fixture-two'), Boolean, 'token rotation reaches document');
  await redditFrames()[0].evaluate(() => { document.cookie = 'native_preference=ok; SameSite=None; Secure; path=/'; });
  assert((await context.cookies('https://www.reddit.com/')).some(cookie => cookie.name === 'native_preference' && cookie.value === 'ok'));
  assert((await context.cookies('https://www.reddit.com/')).some(cookie => cookie.name === 'csrf_token' && cookie.sameSite === 'Strict'));
  const stored = await worker.evaluate(async () => JSON.stringify([await chrome.storage.local.get(null), await chrome.storage.session.get(null)]));
  assert(!stored.includes('fixture-one') && !stored.includes('fixture-two'));
  await worker.evaluate(() => chrome.cookies.remove({ url: 'https://www.reddit.com/', name: 'csrf_token' }));
  for (const frame of redditFrames()) await until(() => frame.evaluate(() => !document.cookie.includes('csrf_token=')), Boolean, 'removed token clears fallback');
  await worker.evaluate(() => chrome.cookies.set({ url: 'https://www.reddit.com/', name: 'csrf_token', value: 'fixture-expiring', domain: '.reddit.com', path: '/', secure: true, sameSite: 'strict', expirationDate: Date.now() / 1000 + 2 }));
  for (const frame of redditFrames()) await until(() => hasToken(frame, 'fixture-expiring'), Boolean, 'expiring token arrives');
  for (const frame of redditFrames()) await until(() => frame.evaluate(() => !document.cookie.includes('csrf_token=')), Boolean, 'expired token is never supplied');
  console.log('PASS token rotation/removal update the fallback without persistence, cookie-policy changes or setter interception');

  await context.addCookies([{ name: 'csrf_token', value: 'fixture-three', domain: '.reddit.com', path: '/', secure: true, sameSite: 'Strict' }]);
  const frame = redditFrames()[0];
  await frame.goto('https://www.reddit.com/r/example');
  await until(() => hasToken(frame, 'fixture-three'), Boolean, 'new document receives current token');
  await frame.evaluate(() => { const child = document.createElement('iframe'); child.src = '/nested'; document.body.append(child); });
  await until(() => frame.childFrames().length, count => count === 1, 'nested frame loads');
  assert.equal(await frame.childFrames()[0].evaluate(() => Object.hasOwn(document, 'cookie')), false);
  assert.equal(await worker.evaluate(() => chrome.permissions.remove({ permissions: ['cookies'] })), true);
  await until(() => page.locator('.pane[data-status="permission"]').count(), count => count === 2, 'revocation removes Reddit documents');
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://www.reddit.com/*', 'https://reddit.com/*'] })), true);
  assert.equal(await page.locator('.pane[data-pane-id="pane-1"]').getAttribute('data-status'), 'connected');
  assert.deepEqual(errors, []);
  console.log('PASS navigation binds the new document, nested frames stay native and cookies revocation removes only Reddit');
} finally {
  await context?.close();
  assert.equal(path.dirname(temporary), tmpdir());
  assert(path.basename(temporary).startsWith('3fingers-reddit-csrf-'));
  await rm(temporary, { recursive: true, force: true });
}
