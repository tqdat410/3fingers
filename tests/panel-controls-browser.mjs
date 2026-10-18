import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-controls-'));
const artifacts = path.join(project, 'plans/reports/panel-controls');
let context;
const errors = [];
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

try {
  const extension = path.join(temporary, 'extension');
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['https://*.tiktok.com/*', 'https://www.facebook.com/*', 'https://www.instagram.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(tiktok|facebook|instagram)\.com\//, route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html class="__fb-light-mode" ${new URL(route.request().url()).hostname === 'www.tiktok.com' ? '' : 'data-theme="light" data-tux-color-scheme="light"'}><style>
      body{margin:0;background:#fff;color:#111}html[data-theme="dark"][data-tux-color-scheme="dark"] body{background:#000;color:#eee}
      main{height:4000px}a{display:inline-block;padding:10px}img{width:32px;height:32px}
      </style><a id="spa" href="#post">SPA</a><a id="full" href="/detail">Document</a><main>Fixture</main>
      <img id="media" src="data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==">
      <script>if(location.hostname==='www.tiktok.com')setTimeout(()=>{document.documentElement.dataset.theme='light';document.documentElement.setAttribute('data-tux-color-scheme','light');},250);
      document.querySelector('#spa').onclick=e=>{e.preventDefault();history.pushState({},'','#post');};</script></html>`,
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const panes = [{ id: 'tt', url: 'https://www.tiktok.com/foryou', enabled: true, pinned: false, theme: 'site' },
    { id: 'fb', url: 'https://www.facebook.com/', enabled: true, pinned: false, theme: 'site' }];
  await worker.evaluate(panes => chrome.storage.local.set({ workspace: { panes }, workspaceOverflow: [] }), panes);
  const page = await context.newPage();
  const workspaceUrl = `chrome-extension://${extensionId}/workspace.html`;
  await page.goto(workspaceUrl);
  const pane = id => page.locator(`.pane[data-pane-id="${id}"]`);
  const frame = host => page.frames().find(frame => new URL(frame.url()).hostname === host);
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 2, 'panels connect');
  await until(() => pane('tt').locator('.pane-theme').isEnabled(), Boolean, 'TikTok theme ready');
  const tt = frame('www.tiktok.com');
  const originalDocument = await tt.evaluate(() => { window.documentMarker = crypto.randomUUID(); return window.documentMarker; });
  await pane('tt').locator('.pane-theme').click();
  await until(() => tt.evaluate(() => getComputedStyle(document.body).backgroundColor), value => value === 'rgb(0, 0, 0)', 'native dark palette');
  await tt.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.setAttribute('data-tux-color-scheme', 'light'); });
  await until(() => tt.evaluate(() => document.documentElement.dataset.theme), value => value === 'dark', 'retain explicit theme');
  assert.equal(await tt.locator('#media').evaluate(node => getComputedStyle(node).filter), 'none');
  assert.equal(await tt.evaluate(() => localStorage.length), 0);
  await pane('tt').locator('.pane-theme').click();
  await until(() => tt.evaluate(() => getComputedStyle(document.body).backgroundColor), value => value === 'rgb(255, 255, 255)', 'native light palette');
  assert.equal(await tt.evaluate(() => window.documentMarker), originalDocument);
  const directTheme = mode => worker.evaluate(async ({ mode, paneId }) => {
    const { sessions } = await chrome.storage.session.get('sessions');
    const [tabId, session] = Object.entries(sessions)[0];
    const entry = session.panes.find(pane => pane.id === paneId);
    return { tabId: Number(tabId), documentId: entry.documentId, mode };
  }, { mode, paneId: 'tt' });
  const target = await directTheme('site');
  await page.evaluate(async target => {
    const { applySocialTheme } = await import('./shared/social-theme.js');
    await chrome.scripting.executeScript({ target: { tabId: target.tabId, documentIds: [target.documentId] },
      func: applySocialTheme, args: [target.mode] });
  }, target);
  assert.equal(await tt.evaluate(() => document.documentElement.dataset.theme), 'light');
  console.log('PASS TikTok native palettes switch, retain explicit choice, restore originals and leave media/storage/document intact');

  const fb = frame('www.facebook.com');
  assert.equal(await pane('fb').locator('.pane-back').isDisabled(), true);
  await fb.locator('#spa').click();
  await until(() => pane('fb').locator('.pane-back').isEnabled(), Boolean, 'SPA enables Back');
  await tt.locator('#spa').click();
  await until(() => tt.url(), url => url.endsWith('#post'), 'peer SPA committed before Back');
  await pane('fb').locator('.pane-back').click();
  await until(() => frame('www.facebook.com')?.url(), url => url === panes[1].url, 'Back returns only selected SPA');
  assert(tt.url().endsWith('#post'));
  assert.equal(page.url(), workspaceUrl);
  await until(() => pane('fb').locator('.pane-back').isDisabled(), Boolean, 'Back disables at first entry');
  await frame('www.facebook.com').locator('#full').click();
  await until(() => pane('fb').getAttribute('data-status'), value => value === 'connected', 'document navigation reconnects');
  await until(() => pane('fb').locator('.pane-back').isEnabled(), Boolean, 'document enables Back');
  await pane('fb').locator('.pane-back').click();
  await until(() => frame('www.facebook.com')?.url(), url => url === panes[1].url, 'document Back returns to original');
  assert(tt.url().endsWith('#post'));
  assert.equal(page.url(), workspaceUrl);
  const controlsPage = await context.newPage();
  await controlsPage.goto(`chrome-extension://${extensionId}/popup.html`);
  const rejected = await controlsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'pane-back', paneId: 'fb' }));
  assert.equal(rejected.ok, false);
  await controlsPage.close();
  console.log('PASS panel Back handles SPA and document history without traversing peers/workspace and rejects non-workspace commands');

  const choose = async (id, share) => {
    await pane(id).locator('.pane-layout').click();
    await page.locator(`#layout-picker [data-share="${share}"]`).click();
    await until(() => pane(id).locator('.pane-layout').isEnabled(), Boolean, 'layout saved');
  };
  const widths = () => page.locator('.pane').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  const assertWidths = async expected => {
    await until(widths, values => values.every((value, index) => Math.abs(value - expected[index]) < 2), 'complementary widths');
  };
  await choose('tt', 1); await assertWidths([480, 960]);
  assert.equal(await tt.evaluate(() => window.documentMarker), originalDocument);
  await choose('fb', 1); await assertWidths([960, 480]);
  await choose('tt', 0); await assertWidths([720, 720]);
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.split, undefined);
  await choose('tt', 2);
  await page.reload();
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 2, 'split restores');
  await assertWidths([960, 480]);
  await pane('tt').locator('.pane-drag-handle').focus(); await page.keyboard.press('ArrowRight');
  await until(() => page.locator('.pane').last().getAttribute('data-pane-id'), id => id === 'tt', 'split panel reordered');
  await assertWidths([480, 960]);
  await pane('fb').locator('.pane-layout').click();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await assertWidths([720, 720]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, 'panel-controls.png') });
  console.log('PASS complementary thirds/half persist, follow panel identity on reorder and support keyboard without replacing iframe documents');

  await choose('tt', 2);
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#add-panel').click(); await popup.locator('.social-option[data-site="Instagram"]').click();
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'third panel added');
  await assertWidths([480, 480, 480]);
  assert.equal(await page.locator('.pane-layout:disabled').count(), 3);
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.split, undefined);
  await page.locator('.pane-close').last().click(); await assertWidths([720, 720]);
  await choose('tt', 2);
  await page.locator('.pane-close').first().click(); await assertWidths([1440]);
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.split, undefined);
  assert.equal(await page.locator('.pane-layout:disabled').count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS one/three-panel layouts stay full/equal, disable width picker and clear stale split when count changes');
} finally {
  await context?.close();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert(path.basename(temporary).startsWith('3fingers-controls-'));
  await rm(temporary, { recursive: true, force: true });
}
