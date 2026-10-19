import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeThemeControls } from './fixtures/native-theme-controls.mjs';
import { applySocialTheme } from '../extension/shared/social-theme.js';
import { builtinThemeControls } from './fixtures/builtin-theme-controls.mjs';

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
      ${new URL(route.request().url()).hostname === 'www.facebook.com' ? builtinThemeControls('www.facebook.com') : nativeThemeControls()}
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
  const tt = frame('www.tiktok.com');
  const originalDocument = await tt.evaluate(() => { window.documentMarker = crypto.randomUUID(); return window.documentMarker; });
  await until(() => pane('tt').locator('.pane-theme').isEnabled(), Boolean, 'native TikTok handler ready');
  assert.equal((await tt.evaluate(applySocialTheme, 'dark')).applied, true);
  assert.equal((await tt.evaluate(applySocialTheme, 'light')).applied, true);
  assert.deepEqual(await tt.evaluate(() => window.nativeThemeCalls), ['dark', 'light']);
  assert.equal(await tt.evaluate(() => window.visibleNativeDrawerFrames), 0);
  assert.equal(await tt.evaluate(() => Object.hasOwn(document, 'cookie')), false, 'native theme write compatibility is cleaned up');
  const themeFrame = frame('www.facebook.com');
  await until(() => pane('fb').locator('.pane-theme').isEnabled(), Boolean, 'verified direct native handler ready');
  await themeFrame.evaluate(() => { window.themeMenuClicks = 0; document.addEventListener('click', () => window.themeMenuClicks++, true); });
  await pane('fb').locator('.pane-theme').click();
  await until(() => themeFrame.evaluate(() => document.documentElement.classList.contains('__fb-dark-mode')), Boolean, 'MAIN-world native preference handler changes theme');
  assert.deepEqual(await themeFrame.evaluate(() => window.nativeThemeCalls), ['dark']);
  assert.equal(await themeFrame.evaluate(() => window.themeMenuClicks), 0, 'direct handler never clicks native UI');
  assert.equal(await themeFrame.locator('#builtin-theme-menu').isHidden(), true);
  const normalFacebook = await context.newPage();
  await normalFacebook.goto('https://www.facebook.com/');
  assert.equal((await normalFacebook.evaluate(applySocialTheme, 'dark')).supported, false, 'normal Facebook tab cannot invoke native preference adapter');
  assert.deepEqual(await normalFacebook.evaluate(() => window.nativeThemeCalls), []);
  await normalFacebook.close();
  await themeFrame.evaluate(() => {
    const child = document.createElement('iframe');
    child.name = window.name;
    child.id = 'nested-theme';
    child.src = 'https://www.facebook.com/nested';
    document.body.append(child);
  });
  const nestedTheme = await (await themeFrame.locator('#nested-theme').elementHandle()).contentFrame();
  await nestedTheme.waitForLoadState('load');
  assert.equal((await nestedTheme.evaluate(applySocialTheme, 'dark')).supported, false, 'nested frame cannot invoke native preference adapter');
  assert.deepEqual(await nestedTheme.evaluate(() => window.nativeThemeCalls), []);
  await themeFrame.locator('#nested-theme').evaluate(node => node.remove());
  await themeFrame.evaluate(() => window.nativeChooseTheme('light'));
  await until(() => pane('fb').locator('.pane-theme').getAttribute('aria-pressed'), value => value === 'false', 'isolated observer follows native manual setting');
  await themeFrame.evaluate(() => window.nativeThemeBlocked = true);
  await pane('fb').locator('.pane-theme').click();
  await until(() => pane('fb').locator('.pane-reload').isEnabled(), Boolean, 'failed native call settles');
  await until(() => pane('fb').locator('.pane-theme').isEnabled(), Boolean, 'native failure retains the verified capability for retry');
  assert.equal(await themeFrame.evaluate(() => document.documentElement.classList.contains('__fb-dark-mode')), false);
  assert.equal(await themeFrame.evaluate(() => window.themeMenuClicks), 0);
  await themeFrame.evaluate(() => window.nativeThemeBlocked = false);
  await pane('fb').locator('.pane-theme').click();
  await until(() => themeFrame.evaluate(() => document.documentElement.classList.contains('__fb-dark-mode')), Boolean, 'retry succeeds after transient native failure');
  await themeFrame.evaluate(() => window.nativeChooseTheme('light'));
  console.log('PASS native theme calls avoid menus, clean up write compatibility, follow manual changes and permit retry without forced recoloring');

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
  await pane('tt').locator('.pane-layout').click();
  assert.deepEqual(await page.locator('#layout-picker button').allTextContents(), ['33%', '50%', '66%']);
  await page.locator('#layout-picker button').first().dispatchEvent('wheel', { deltaY: 20 });
  assert.equal(await page.locator('#layout-picker').evaluate(node => node.matches(':popover-open')), true, 'inside menu interaction retains it');
  await page.keyboard.press('Escape');
  for (const [button, menu] of [['.pane-layout', '#layout-picker'], ['.pane-select', '#site-picker']]) {
    for (const host of ['www.tiktok.com', 'www.facebook.com']) {
      for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) {
        await pane('tt').locator(button).click();
        await until(async () => {
          await frame(host).locator('main').dispatchEvent(type, type === 'wheel' ? { deltaY: 100 } : type === 'keydown' ? { key: 'a' } : {});
          return page.locator(menu).evaluate(node => !node.matches(':popover-open'));
        }, Boolean, `dismiss ${menu} on ${host} ${type}`);
      }
    }
  }
  await pane('tt').locator('.pane-layout').click();
  await page.locator('.pane-toolbar').last().dispatchEvent('wheel', { deltaY: 50 });
  await until(() => page.locator('#layout-picker').evaluate(node => !node.matches(':popover-open')), Boolean, 'outside workspace wheel dismisses');
  assert.equal(await tt.evaluate(() => window.documentMarker), originalDocument);
  console.log('PASS percentage labels and menu dismissal cover wheel, click, touch and keys in either cross-origin feed without reload');
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
  await popup.locator('#add-panel').click();
  await popup.locator('#social-chooser').dispatchEvent('wheel', { deltaY: 20 });
  assert.equal(await popup.locator('#add-sites').isHidden(), false);
  await popup.locator('.description').dispatchEvent('wheel', { deltaY: 20 });
  assert.equal(await popup.locator('#add-sites').isHidden(), true);
  await popup.locator('#add-panel').click(); await popup.locator('.description').click();
  assert.equal(await popup.locator('#add-sites').isHidden(), true);
  console.log('PASS popup picker stays open inside and dismisses on outside click or wheel');
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
