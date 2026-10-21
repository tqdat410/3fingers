import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { documentHtml, documentContents, download } from '../src/lib/content.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const routes = ['', 'en/', 'vi/', 'en/docs/', 'vi/docs/', 'en/guide/', 'vi/guide/', 'en/privacy/', 'vi/privacy/'];
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}
test('all routes are static HTML, shared documents render directly, and stable download is used', async () => {
  for (const route of routes) {
    const html = await readFile(path.join(dist, route, 'index.html'), 'utf8');
    assert.match(html, /<!DOCTYPE html>/i);
    if (/^(en|vi)\/$/.test(route)) {
      assert.ok(html.includes(download));
      assert.equal(html.replace(/<[^>]*>/g, '').split('Multitask is not real!').length - 1, 1);
    }
  }
  for (const locale of ['en', 'vi']) for (const page of ['guide', 'privacy']) {
    const html = await readFile(path.join(dist, locale, page, 'index.html'), 'utf8');
    assert.ok(html.includes(await documentHtml(locale, page)), `${locale}/${page} must use current shared Markdown`);
    assert.match(html, new RegExp(`<html lang="${locale}"`));
  }
  assert.match(await readFile(path.join(dist, '404.html'), 'utf8'), /Page not found/);
  const output = await files(dist);
  assert.ok(!output.some(file => /(?:^|[/\\])(?:server|functions|_worker\.js)(?:[/\\]|$)/.test(file)));
});
test('internal links and assets resolve in the static output', async () => {
  for (const file of (await files(dist)).filter(file => file.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    for (const [, href] of html.matchAll(/(?:href|src)="(\/(?!\/)[^"#]*)[^"]*"/g)) {
      const pathname = decodeURIComponent(href.split('?')[0]);
      const target = path.join(dist, pathname, pathname.endsWith('/') ? 'index.html' : '');
      assert.ok((await stat(target)).isFile(), `${file}: missing ${href}`);
    }
  }
  for (const asset of ['brand/logo-original.png', 'fonts/Ubuntu-Regular.ttf', 'fonts/Ubuntu-Medium.ttf', 'fonts/Ubuntu-Bold.ttf', 'fonts/UFL.txt', 'fonts/COPYRIGHT.txt']) {
    const copied = await readFile(path.join(dist, 'assets', asset));
    assert.deepEqual(copied, await readFile(new URL(`../../extension/assets/${asset}`, import.meta.url)));
  }
});

test('Docs aggregate shared user guidance and privacy with unique working contents targets', async () => {
  for (const locale of ['en', 'vi']) {
    const content = await documentHtml(locale, 'docs');
    const html = await readFile(path.join(dist, locale, 'docs/index.html'), 'utf8');
    assert(html.includes(content));
    assert(content.includes(await documentHtml(locale, 'guide')));
    const ids = [...content.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal((content.match(/<h1 /g) || []).length, 1);
    const contents = documentContents(content);
    assert(contents.length >= 12);
    for (const item of contents) assert(html.includes('href="#' + item.id + '"'));
    const alias = await readFile(path.join(dist, locale, 'guide/index.html'), 'utf8');
    assert(alias.includes(content), 'legacy guide shows the complete Docs');
  }
});
