import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-localization-'));
let context;
async function until(read, predicate, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const value = await read(); if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(label);
}
try {
  const extension = path.join(temporary, 'extension');
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['https://www.facebook.com/*', 'https://x.com/*', 'https://api.x.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  for (const language of ['en', 'vi']) {
    context = await chromium.launchPersistentContext(path.join(temporary, 'profile-' + language), {
      channel: 'chromium', headless: true, viewport: {width:1440,height:900},
      args: ['--lang=' + language, '--disable-extensions-except=' + extension, '--load-extension=' + extension],
    });
    const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('https://www.facebook.com/**', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><main style="height:8000px">Fixture</main></body></html>'}));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const uiLanguage = await worker.evaluate(() => chrome.i18n.getUILanguage());
    assert.equal(uiLanguage.toLowerCase().split('-')[0], language, 'actual Chrome UI language');
    const base = await worker.evaluate(async () => {
      await chrome.storage.local.set({workspace:{panes:[{id:'fb',url:'https://www.facebook.com/',enabled:true,pinned:true,theme:'site'},{id:'x',url:'https://x.com/home?lang=',enabled:true,pinned:false,theme:'site'}]},workspaceOverflow:[]});
      return chrome.runtime.getURL('');
    });
    const page = await context.newPage(); await page.goto(base + 'myfeeds.html');
    await until(() => page.locator('.pane[data-status="connected"]').count(), n => n === 1, 'connected fixture');
    await until(() => page.locator('html').getAttribute('lang'), value => value === language, 'Auto Chrome UI language');
    const frame = page.frames().find(frame => frame.url().startsWith('https://www.facebook.com/'));
    const marker = await frame.evaluate(() => { window.documentMarker = crypto.randomUUID(); scrollTo(0, 450); return window.documentMarker; });
    const scroll = await frame.evaluate(() => scrollY);
    const originalFrame = await page.locator('iframe').evaluate(frame => { frame.dataset.identity = 'retained'; return frame.src; });
    const popup = await context.newPage(); await popup.goto(base + 'popup.html');
    await until(() => popup.locator('html').getAttribute('lang'), value => value === language, 'popup Auto');
    assert.equal(await popup.locator('#language').inputValue(), 'auto');
    assert.equal(await popup.evaluate(() => document.body.scrollWidth <= document.body.clientWidth), true, 'compact popup has no horizontal overflow');
    assert.equal(await popup.locator('.description').innerText(), 'Multitask is not real!');
    assert.equal(await page.locator('[data-pane-id=fb] .pane-status-text').innerText(), language === 'vi' ? 'Đã kết nối' : 'Connected');
    const next = language === 'vi' ? 'en' : 'vi';
    await popup.selectOption('#language', next);
    await until(() => page.locator('html').getAttribute('lang'), value => value === next, 'live workspace switch');
    assert.equal(await page.locator('[data-pane-id=fb] .pane-status-text').innerText(), next === 'vi' ? 'Đã kết nối' : 'Connected');
    assert.equal(await popup.locator('#reload-all').getAttribute('aria-label'), next === 'vi' ? 'Tải lại tất cả' : 'Reload all');
    assert.equal(await page.locator('[data-pane-id=fb] .pane-reload').getAttribute('aria-label'), next === 'vi' ? 'Tải lại Facebook' : 'Reload Facebook');
    assert.equal(await page.locator('[data-pane-id=fb] .pane-drag-handle').getAttribute('aria-pressed'), 'true');
    assert.equal(await frame.evaluate(() => window.documentMarker), marker);
    assert.equal(await frame.evaluate(() => scrollY), scroll);
    assert.equal(await page.locator('iframe').getAttribute('data-identity'), 'retained');
    assert.equal(await page.locator('iframe').getAttribute('src'), originalFrame);
    const accessError = await page.locator('[data-pane-id=x] .pane-status-text').innerText();
    assert.equal(accessError.startsWith(next === 'vi' ? 'X cần quyền truy cập trang giới hạn.' : 'X needs narrow site access.'), true, 'actual worker access error localized');
    await popup.close();
    const reopened = await context.newPage(); await reopened.goto(base + 'popup.html');
    assert.equal(await reopened.locator('#language').inputValue(), next);
    await reopened.selectOption('#language', 'auto');
    await until(() => page.locator('html').getAttribute('lang'), value => value === language, 'restore Auto');
    assert.equal((await page.locator('[data-pane-id=x] .pane-status-text').innerText()).startsWith(language === 'vi' ? 'X cần quyền truy cập trang giới hạn.' : 'X needs narrow site access.'), true, 'existing worker error rerenders');
    assert.equal(await frame.evaluate(() => window.documentMarker), marker);
    assert.deepEqual(errors, []);
    console.log('PASS actual Chrome Auto ' + language + ', manual persistence, live statuses/aria, retained iframe/scroll/pin');
    await context.close(); context = null;
  }
} finally { await context?.close(); await rm(temporary, {recursive:true,force:true}); }
