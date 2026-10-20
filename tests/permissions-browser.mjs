import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-permissions-'));
const extension = path.join(temporary, 'extension');
const wildcard = 'https://*.tiktok.com/*';
const narrow = 'https://www.tiktok.com/*';
const newSites = [
  { name: 'Reddit', url: 'https://www.reddit.com/', permission: 'https://www.reddit.com/*' },
  { name: 'YouTube Shorts', url: 'https://www.youtube.com/shorts/', permission: 'https://www.youtube.com/*' },
];
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
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(tiktok|facebook|reddit|youtube)\.com\//, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><main style="height:4000px">Permission fixture</main>',
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const workspace = await context.newPage();
  const popup = await context.newPage();
  return { worker, workspace, popup, root };
}

async function denyRequests(page) {
  // Only simulate the user's Deny response; all permission checks and routing stay real.
  await page.evaluate(() => {
    window.permissionRequests = [];
    chrome.permissions.request = async details => {
      window.permissionRequests.push(details);
      return false;
    };
  });
}

try {
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['https://www.facebook.com/*', narrow];
  await writeFile(manifestPath, JSON.stringify(manifest));
  let { worker, workspace, popup, root } = await launch();
  const legacy = { id: 'legacy-tiktok', url: 'https://www.tiktok.com/foryou', enabled: true, pinned: true, theme: 'site' };
  const peer = { id: 'peer', url: 'https://www.facebook.com/', enabled: true, pinned: false, theme: 'site' };
  const archived = { ...legacy, id: 'archived-tiktok', pinned: false };
  await worker.evaluate(data => chrome.storage.local.set(data), {
    workspace: { panes: [legacy, peer] }, workspaceOverflow: [archived],
  });
  await workspace.goto(`${root}/myfeeds.html`);
  await popup.goto(`${root}/popup.html`);
  const legacyPane = () => workspace.locator('.pane[data-pane-id="legacy-tiktok"]');
  const peerPane = () => workspace.locator('.pane[data-pane-id="peer"]');
  await until(() => legacyPane().getAttribute('data-status'), value => value === 'permission', 'legacy scope rejected');
  await until(() => peerPane().getAttribute('data-status'), value => value === 'connected', 'peer retains exact grant');
  assert.equal(await legacyPane().locator('iframe').count(), 0);
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes,
    [{ ...legacy, enabled: false }, peer]);
  const rulesBefore = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  assert.deepEqual(rulesBefore.map(rule => rule.condition.requestDomains), [['www.facebook.com']]);

  await denyRequests(workspace);
  await legacyPane().locator('.pane-open').click();
  await until(() => legacyPane().locator('.pane-status-text').innerText(), value => value === 'Site access denied.', 'upgrade denied');
  assert.equal(await legacyPane().locator('iframe').count(), 0);
  await peerPane().locator('.pane-select').click();
  await workspace.locator('.social-option[data-site="TikTok"]').click();
  await until(() => workspace.locator('#workspace-status').innerText(), value => value.includes('Current site kept'), 'replacement denied');
  assert.equal(await peerPane().getAttribute('aria-label'), 'Facebook');
  assert.deepEqual(await workspace.evaluate(() => window.permissionRequests), [{ origins: [wildcard] }, { origins: [wildcard] }]);
  await workspace.keyboard.press('Escape');

  await denyRequests(popup);
  await popup.locator('#add-panel').click();
  await popup.locator('.social-option[data-site="TikTok"]').click();
  await until(() => popup.locator('#popup-status').innerText(), value => value === 'Site access denied.', 'add denied');
  await popup.locator('#add-panel').click();
  await popup.locator('.archive-restore').click();
  await until(() => popup.evaluate(() => window.permissionRequests.length), value => value === 2, 'archive requests scope');
  assert.deepEqual(await popup.evaluate(() => window.permissionRequests), [{ origins: [wildcard] }, { origins: [wildcard] }]);
  const rejected = await popup.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === chrome.runtime.getURL('myfeeds.html'));
    return chrome.tabs.sendMessage(tab.id, { type: 'workspace-controls', action: 'add', url }, { frameId: 0 });
  }, legacy.url);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'Site access required.');
  assert.equal(await workspace.locator('.pane').count(), 2);
  console.log('PASS legacy scope is blocked; Open, replace, add and archive request broader access only on click; denial preserves panels');

  for (const site of newSites) {
    await workspace.bringToFront(); await workspace.keyboard.press('Escape');
    await peerPane().locator('.pane-select').click();
    await workspace.locator(`.social-option[data-site="${site.name}"]`).click();
    assert.equal(await peerPane().getAttribute('aria-label'), 'Facebook');
    await until(() => workspace.evaluate(() => window.permissionRequests.at(-1)),
      request => request?.origins[0] === site.permission && (site.name !== 'Reddit' || request.permissions?.includes('cookies')), 'replacement requests exact new-site origin');
    await popup.bringToFront(); await popup.keyboard.press('Escape');
    await popup.locator('#add-panel').click();
    await popup.locator(`.social-option[data-site="${site.name}"]`).click();
    await until(() => popup.evaluate(() => window.permissionRequests.at(-1)),
      request => request?.origins[0] === site.permission && (site.name !== 'Reddit' || request.permissions?.includes('cookies')), 'add requests exact new-site origin');
    assert.equal(await workspace.locator('.pane').count(), 2);
  }
  assert.equal(await popup.locator('.social-option[data-site="X"]').count(), 1);
  console.log('PASS Reddit and YouTube denial preserves layout and requests only their exact origins; X remains available');

  // Native Allow dialogs are outside Playwright. Grant in the test manifest, then
  // use the real request/contains APIs to exercise the post-approval lifecycle.
  await context.close(); context = null;
  manifest.permissions.push('cookies');
  manifest.host_permissions = ['https://www.facebook.com/*', wildcard, 'https://reddit.com/*', ...newSites.map(site => site.permission)];
  await writeFile(manifestPath, JSON.stringify(manifest));
  ({ worker, workspace, popup, root } = await launch());
  await workspace.goto(`${root}/myfeeds.html`);
  await popup.goto(`${root}/popup.html`);
  await until(() => legacyPane().locator('.pane-open').isVisible(), Boolean, 'upgrade remains explicit');
  await legacyPane().locator('.pane-open').click();
  await until(() => legacyPane().getAttribute('data-status'), value => value === 'connected', 'approved panel opens');
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes, [legacy, peer]);
  await popup.locator('#add-panel').click();
  await popup.locator('.archive-restore').click();
  await until(() => workspace.locator('.pane[data-status="connected"]').count(), value => value === 3, 'archive restored');
  const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  for (const rule of rules.filter(rule => rule.condition.requestDomains.includes('www.tiktok.com'))) {
    assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
    assert.equal(rule.condition.tabIds.length, 1);
    assert.equal(rule.action.requestHeaders, undefined);
    assert(!new RegExp(rule.condition.regexFilter).test('https://v16-webapp-prime.tiktok.com/video'));
  }
  assert.equal(rules.length, 3);
  await workspace.reload(); await popup.reload();
  await until(() => workspace.locator('.pane[data-status="connected"]').count(), value => value === 3, 'approved layout restores');
  await popup.locator('#reload-all').click();
  await until(() => workspace.locator('.pane[data-status="connected"]').count(), value => value === 3, 'reload all remains permitted');
  console.log('PASS broader grant restores original panel and archive; reload preserves narrow frame rules');

  // Removing a required host in the next test version leaves the earlier grant
  // available as optional access, allowing a real permissions.onRemoved test.
  await context.close(); context = null;
  manifest.host_permissions = ['https://www.facebook.com/*', narrow];
  await writeFile(manifestPath, JSON.stringify(manifest));
  ({ worker, workspace, popup, root } = await launch());
  assert.equal(await worker.evaluate(origin => chrome.permissions.contains({ origins: [origin] }), wildcard), true);
  await workspace.goto(`${root}/myfeeds.html`);
  await until(() => workspace.locator('.pane[data-status="connected"]').count(), value => value === 3, 'optional grant retained');
  assert.equal(await worker.evaluate(origin => chrome.permissions.remove({ origins: [origin] }), wildcard), true);
  await until(() => workspace.locator('.pane[data-status="permission"]').count(), value => value === 2, 'revoked TikTok panels stop');
  assert.equal(await workspace.locator('iframe').count(), 1);
  assert.equal(await peerPane().getAttribute('data-status'), 'connected');
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 1);
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes.map(({ id, pinned }) => ({ id, pinned })),
    [{ id: legacy.id, pinned: true }, { id: peer.id, pinned: false }, { id: archived.id, pinned: false }]);
  assert.deepEqual(errors, []);
  console.log('PASS real permission revocation removes TikTok frames and rules while retaining layout, pins and peer access');

  const fresh = newSites.map((site, index) => ({ id: `new-${index}`, url: site.url, enabled: true, pinned: index === 0, theme: 'site' }));
  await worker.evaluate(panes => chrome.storage.local.set({ workspace: { panes }, workspaceOverflow: [] }), [...fresh, peer]);
  await workspace.reload();
  await until(() => workspace.locator('.pane[data-status="connected"]').count(), value => value === 3, 'new optional grants retained');
  const grantedRules = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  assert.deepEqual(grantedRules.map(rule => rule.condition.requestDomains[0]).sort(), ['www.facebook.com', 'www.reddit.com', 'www.youtube.com']);
  for (const [index, site] of newSites.entries()) {
    assert.equal(await worker.evaluate(origin => chrome.permissions.remove({ origins: [origin] }), site.permission), true);
    await until(() => workspace.locator(`.pane[data-pane-id="new-${index}"]`).getAttribute('data-status'), value => value === 'permission', 'new-site revocation removes frame');
    assert.equal(await peerPane().getAttribute('data-status'), 'connected');
    assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 2 - index);
    assert.equal(await workspace.locator(`.pane[data-pane-id="new-${index}"] iframe`).count(), 0);
  }
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes.map(({ id, pinned }) => ({ id, pinned })),
    [...fresh, peer].map(({ id, pinned }) => ({ id, pinned })));
  assert.deepEqual(errors, []);
  console.log('PASS Reddit and YouTube revocation removes only matching frames/rules and retains pins, order and permitted peers');
} finally {
  await context?.close();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert(path.basename(temporary).startsWith('3fingers-permissions-'));
  await rm(temporary, { recursive: true, force: true });
}
