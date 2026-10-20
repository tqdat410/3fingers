import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };
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
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4321, '127.0.0.1', resolve); });
  console.log(`Website test server PID ${process.pid}, port 4321, worktree ${process.cwd()}`);
  browser = await chromium.launch({ headless: true });
  await mkdir(output, { recursive: true });
  for (const [language, expected] of [['vi-VN', 'vi'], ['fr-FR', 'en']]) {
    const context = await browser.newContext({ locale: language });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4321/');
    await page.waitForURL(`**/${expected}/`);
    await page.goto('http://127.0.0.1:4321/en/guide/');
    await page.locator('[data-locale="vi"]').click();
    await page.waitForURL('**/vi/guide/');
    assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
    await page.goto('http://127.0.0.1:4321/');
    await page.waitForURL('**/vi/');
    await page.goto('http://127.0.0.1:4321/en/privacy/');
    assert.ok(page.url().endsWith('/en/privacy/'), 'explicit locale does not redirect');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const width of [375, 768, 1440]) for (const locale of ['en', 'vi']) for (const route of ['', 'guide/', 'privacy/']) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:4321/${locale}/${route}`);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}: ${locale}/${route}`);
    assert.ok(await page.locator('h1').isVisible());
    for (const image of await page.locator('img').all()) assert.ok(await image.evaluate(element => element.complete && element.naturalWidth > 0));
    await page.screenshot({ path: path.join(output, `${locale}-${route.replace('/', '') || 'home'}-${width}.png`), fullPage: true });
  }
  await page.goto('http://127.0.0.1:4321/en/');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
  await page.keyboard.press('Enter');
  assert.ok(page.url().endsWith('#main'));
  const missing = await page.goto('http://127.0.0.1:4321/does-not-exist/');
  assert.equal(missing.status(), 404);
  assert.ok(await page.getByText('Page not found.', { exact: false }).isVisible());
  await context.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  await fallback.goto('http://127.0.0.1:4321/');
  assert.ok(await fallback.getByRole('link', { name: 'English', exact: true }).last().isVisible());
  await noScript.close();
  console.log('Website browser checks passed: locale, navigation, fallback, 404, keyboard and 18 responsive views.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  console.log('Website test server on port 4321 stopped.');
}
