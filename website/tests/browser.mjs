import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };
// The test owns this one server and fails on a busy port. It never chooses another port.
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(dist, `.${pathname}`);
    if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) throw new Error('Invalid path');
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch { file = path.join(dist, '404.html'); response.statusCode = 404; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 500; response.end('Test server error'); }
});
const externalServer = process.env.WEBSITE_TEST_URL;
const origin = externalServer || 'http://127.0.0.1:4321';
let browser;
try {
  if (!externalServer) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4321, '127.0.0.1', resolve); });
    console.log('Owned website test server on port 4321, PID ' + process.pid);
  } else console.log('Reusing existing website server: ' + origin);
  browser = await chromium.launch({ headless: true });
  await mkdir(output, { recursive: true });
  for (const [language, expected] of [['vi-VN', 'vi'], ['fr-FR', 'en']]) {
    const context = await browser.newContext({ locale: language });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.waitForURL(`**/${expected}/`);
    await page.goto(origin + '/en/guide/');
    await page.locator('[data-locale="vi"]').click();
    await page.waitForURL('**/vi/guide/');
    assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
    await page.goto(origin + '/');
    await page.waitForURL('**/vi/');
    await page.goto(origin + '/en/privacy/');
    assert.ok(page.url().endsWith('/en/privacy/'), 'explicit locale does not redirect');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.goto(origin + '/' + expected + '/');
    assert.equal(await page.locator('header').count(), 0);
    assert.equal(await page.locator('.language-toggle').count(), 1);
    assert.equal(await page.locator('.social-list li').count(), 7);
    assert.equal(await page.locator('.social-list').innerText(), '');
    for (const icon of await page.locator('.social-list img').all()) assert(await icon.getAttribute('alt'));
    for (const link of await page.locator('.hero-tools a[href^="https://github.com"], .downloads a').all()) {
      assert.equal(await link.getAttribute('target'), '_blank');
      assert((await link.getAttribute('rel')).includes('noopener'));
    }
    assert.equal(await page.locator('.store-download').isDisabled(), true);
    assert.equal(await page.locator('.store-download').getAttribute('href'), null);
    assert.equal(await page.title(), 'Welcome · 3fingers');
    assert.equal(await page.locator('body').getByText('Welcome', { exact: true }).count(), 0);
    await page.locator('.installation .text-link').click();
    const installationId = expected === 'vi' ? 'cài-đặt' : 'install';
    await page.waitForURL(url => url.pathname === '/' + expected + '/docs/' && decodeURIComponent(url.hash) === '#' + installationId);
    assert.equal(await page.locator(`[id="${installationId}"]`).count(), 1);
    await page.goBack();
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    await page.locator('#site-theme').click();
    await page.waitForFunction(() => !document.documentElement.dataset.transition);
    const chosenTheme = initialTheme === 'dark' ? 'light' : 'dark';
    assert.equal(await page.locator('html').getAttribute('data-theme'), chosenTheme);
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), chosenTheme);
    await page.locator('.language-toggle').click();
    const next = expected === 'en' ? 'vi' : 'en';
    await page.waitForURL('**/' + next + '/');
    await page.waitForFunction(() => !document.documentElement.dataset.transition);
    assert.equal(await page.locator('.language-toggle').innerText(), next.toUpperCase());
    assert.equal(await page.locator('html').getAttribute('data-theme'), chosenTheme);
    await page.goto(origin + '/');
    await page.waitForURL('**/' + next + '/');
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const width of [375, 768, 1440]) for (const locale of ['en', 'vi']) for (const route of ['', 'docs/', 'guide/', 'privacy/']) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/${locale}/${route}`);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}: ${locale}/${route}`);
    assert.ok(await page.locator('h1').isVisible());
    if (route === 'docs/') {
      assert.equal(await page.locator('.docs-sidebar #site-theme').count(), 1);
      assert.equal(await page.locator('.docs-sidebar .language-toggle').count(), 1);
      if (width > 900) {
        const sidebar = await page.locator('.docs-sidebar').boundingBox();
        const main = await page.locator('.docs-main').boundingBox();
        assert(sidebar.x + sidebar.width <= main.x, 'Docs contents stay left of the article');
      } else assert.equal(await page.locator('.docs-toc nav').isVisible(), true);
    }
    for (const image of await page.locator('img').all()) assert.ok(await image.evaluate(element => element.complete && element.naturalWidth > 0));
    if (!route) {
      const logo = await page.locator('.hero-logo').boundingBox();
      const title = await page.locator('h1').boundingBox();
      const lines = await page.locator('h1 span').all();
      assert(logo.x + logo.width <= title.x, 'logo stays left of quote at ' + width);
      assert.equal(lines.length, 2);
      const first = await lines[0].boundingBox(), second = await lines[1].boundingBox();
      assert(second.y > first.y && Math.abs(first.x - second.x) < 1, 'quote has two aligned lines');
      const language = await page.locator('.language-toggle').boundingBox();
      const docs = await page.locator('.docs-link').boundingBox();
      assert.equal(language.y, docs.y, 'Docs stays on the language control row');
      assert(docs.x >= language.x + language.width);
      assert.equal(await page.locator('.docs-link').innerText(), '');
      assert.equal(await page.locator('.docs-link').getAttribute('aria-label'), 'Docs');
      assert.equal(await page.locator('.docs-link').getAttribute('href'), '/' + locale + '/docs/');
      await page.locator('#site-theme').click();
      await page.waitForFunction(() => !document.documentElement.dataset.transition);
      await page.screenshot({ path: path.join(output, locale + '-home-dark-' + width + '.png'), fullPage:true });
      await page.locator('#site-theme').click();
      await page.waitForFunction(() => !document.documentElement.dataset.transition);
    }
    await page.screenshot({ path: path.join(output, `${locale}-${route.replace('/', '') || 'home'}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(origin + '/en/docs/');
  await page.locator('.docs-toc-title').click();
  assert.equal(await page.locator('.docs-toc nav').isVisible(), true);
  await page.locator('.docs-toc a').first().click();
  await page.waitForURL('**#supported-socials');
  assert.equal(await page.locator('.docs-toc nav').isVisible(), true);
  await page.locator('#site-theme').click();
  await page.waitForFunction(() => !document.documentElement.dataset.transition);
  const docsTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('.language-toggle').click();
  await page.waitForURL('**/vi/docs/');
  assert.equal(await page.locator('html').getAttribute('data-theme'), docsTheme);
  await page.goto(origin + '/en/');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
  await page.keyboard.press('Enter');
  assert.ok(page.url().endsWith('#main'));
  const missing = await page.goto(origin + '/does-not-exist/');
  assert.equal(missing.status(), 404);
  assert.ok(await page.getByText('Page not found.', { exact: false }).isVisible());
  await context.close();
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const calm = await reduced.newPage();
  await calm.goto(origin + '/en/');
  await calm.locator('#site-theme').click();
  assert.equal(await calm.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await calm.locator('html').getAttribute('data-transition'), null);
  await calm.locator('.language-toggle').click();
  await calm.waitForURL('**/vi/');
  assert.equal(await calm.locator('html').getAttribute('data-transition'), null);
  await reduced.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  await fallback.goto(origin + '/');
  assert.ok(await fallback.getByRole('link', { name: 'English', exact: true }).last().isVisible());
  await noScript.close();
  console.log('Website browser checks passed: locale, navigation, fallback, 404, keyboard and 24 responsive views.');
} finally {
  await browser?.close();
  if (server.listening) { await new Promise(resolve => server.close(resolve)); console.log('Owned website test server stopped.'); }
}
