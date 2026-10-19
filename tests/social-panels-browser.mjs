import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-social-panels-'));
const errors = [];
let context;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function until(read, predicate, label) {
  const deadline = Date.now() + 12000;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await wait(50);
  }
  throw Error(label + ': ' + JSON.stringify(value));
}
try {
  const extension = path.join(temporary, 'extension');
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.permissions.push('cookies');
  manifest.host_permissions = ['https://www.facebook.com/*', 'https://www.reddit.com/*', 'https://reddit.com/*', 'https://www.youtube.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route(/^https:\/\/www\.(facebook|reddit|youtube)\.com\//, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><main style="height:5000px">Social fixture</main></body></html>',
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto('chrome-extension://' + new URL(worker.url()).host + '/workspace.html');
  const pane = id => page.locator(`.pane[data-pane-id="${id}"]`);
  const findFrame = host => page.frames().find(candidate => new URL(candidate.url()).hostname === host);
  const newPanes = ['reddit', 'facebook', 'youtube'].map((host, index) => ({
    id: `new-${index}`, url: `https://www.${host}.com/`, enabled: true, pinned: false, theme: 'site',
  }));
  await worker.evaluate(panes => chrome.storage.local.set({ workspace: { panes }, workspaceOverflow: [] }), newPanes);
  await page.reload();
  await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'new sites connect');
  assert.equal(new URL(findFrame('www.youtube.com').url()).pathname, '/shorts/');
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes[2].url, 'https://www.youtube.com/shorts/');
  const reddit = findFrame('www.reddit.com');
  const facebook = findFrame('www.facebook.com');
  const youtube = findFrame('www.youtube.com');
  const socialFrames = [reddit, facebook, youtube];
  const positions = () => Promise.all(socialFrames.map(currentFrame => (
    currentFrame.evaluate(() => document.scrollingElement.scrollTop)
  )));
  const peerPositions = async () => (await positions()).slice(0, 2);

  async function wheelPanel(id, delta) {
    const box = await pane(id).locator('iframe').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, delta);
  }
  await wheelPanel('new-0', 240);
  await until(positions, values => values[0] > 100 && values[1] > 100, 'Reddit sends synchronized scroll');
  assert.equal((await positions())[2], 0);
  const beforePeer = await positions();
  await wheelPanel('new-1', 240);
  await until(positions, values => values[0] > beforePeer[0] + 100, 'Reddit follows peer scroll');
  await wait(300);
  const beforeVideo = await positions();
  await wheelPanel('new-2', 240);
  await until(positions, values => values[2] > beforeVideo[2] + 100, 'YouTube wheel remains native');
  assert.deepEqual(await peerPositions(), beforeVideo.slice(0, 2));
  const videoPin = pane('new-2').locator('.pane-drag-handle');
  assert.equal(await videoPin.getAttribute('aria-disabled'), 'true');
  await videoPin.evaluate(node => node.click());
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes[2].pinned, false);
  for (const id of ['new-0', 'new-2']) assert.equal(await pane(id).locator('.pane-theme').isDisabled(), true);
  assert.equal(await youtube.evaluate(() => document.fullscreenEnabled), true);
  assert.equal(await reddit.evaluate(() => document.fullscreenEnabled), false);
  await youtube.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'fullscreen';
    button.textContent = 'Fullscreen';
    button.style.cssText = 'position:fixed;top:0;left:0';
    button.onclick = () => document.documentElement.requestFullscreen().then(
      () => { window.fullscreenOutcome = 'entered'; },
      error => { window.fullscreenOutcome = error.name; },
    );
    document.body.append(button);
  });
  await youtube.locator('#fullscreen').click();
  const fullscreenOutcome = await until(() => youtube.evaluate(() => window.fullscreenOutcome), Boolean, 'YouTube handles fullscreen gesture');
  assert.equal(fullscreenOutcome, 'entered');
  assert.equal(await youtube.evaluate(() => !!document.fullscreenElement), true);
  await youtube.evaluate(() => document.exitFullscreen());
  console.log('PASS Reddit syncs both ways, YouTube stays independent, unsupported themes stay native and fullscreen is YouTube-only');

  await pane('new-0').locator('.pane-drag-handle').click();
  await wait(250);
  const beforePin = await positions();
  await wheelPanel('new-1', 240);
  await until(positions, values => values[1] > beforePin[1] + 100, 'peer moves with Reddit pinned');
  assert.equal((await positions())[0], beforePin[0]);
  await wheelPanel('new-0', 240);
  await until(positions, values => values[0] > beforePin[0] + 100, 'pinned Reddit moves locally');
  const afterPin = await positions();
  await wait(250);
  assert.equal((await positions())[1], afterPin[1]);
  await pane('new-0').locator('.pane-drag-handle').click();

  for (const route of ['/shorts/first', '/shorts/second']) {
    await youtube.goto(`https://www.youtube.com${route}`);
    await until(() => pane('new-2').getAttribute('data-status'), value => value === 'connected', 'YouTube route reconnects');
    await wait(250);
    const before = await positions();
    await wheelPanel('new-2', 200);
    await until(positions, values => values[2] > before[2] + 80, 'YouTube route scrolls independently');
    assert.deepEqual(await peerPositions(), before.slice(0, 2));
  }
  await until(() => pane('new-2').locator('.pane-back').isEnabled(), Boolean, 'YouTube Back records routes');
  await pane('new-2').locator('.pane-back').click();
  await until(() => youtube.url(), url => url.endsWith('/shorts/first'), 'Back stays in YouTube');
  await until(() => pane('new-2').getAttribute('data-status'), value => value === 'connected', 'YouTube Back reconnects');
  console.log('PASS Reddit pin excludes both directions and YouTube Shorts and Back retain independent scrolling');

  await youtube.evaluate(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.replaceChildren();
    const root = document.createElement('main');
    root.id = 'shorts';
    root.style.cssText = 'height:100vh;overflow-y:scroll;scroll-snap-type:y mandatory!important';
    root.innerHTML = Array.from({ length: 5 }, () => '<section style="height:100vh;scroll-snap-align:start">Shorts fixture</section>').join('');
    document.body.append(root);
  });
  await until(() => youtube.locator('#shorts').getAttribute('data-three-fingers-feed-scroller'), value => value !== null, 'Shorts nested scroller discovered');
  const beforeDrag = await peerPositions();
  const box = await pane('new-2').locator('iframe').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 550);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 250, { steps: 12 });
  assert.equal(await youtube.locator('#shorts').evaluate(node => node.style.getPropertyValue('scroll-snap-type')), 'none');
  assert(await youtube.locator('#shorts').evaluate(node => node.scrollTop) > 100);
  await page.mouse.up();
  assert.deepEqual(await youtube.locator('#shorts').evaluate(node => [node.style.getPropertyValue('scroll-snap-type'), node.style.getPropertyPriority('scroll-snap-type')]), ['y mandatory', 'important']);
  assert.deepEqual(await peerPositions(), beforeDrag);
  console.log('PASS YouTube local drag handles nested Shorts scrollers and restores native snapping without moving peers');

  await pane('new-0').locator('.pane-drag-handle').click();
  for (const site of ['YouTube Shorts', 'Reddit']) {
    await pane('new-0').locator('.pane-select').click();
    await page.locator(`.social-option[data-site="${site}"]`).click();
    await until(() => pane('new-0').getAttribute('aria-label'), value => value === site, 'new-site replacement succeeds');
    await until(() => pane('new-0').getAttribute('data-status'), value => value === 'connected', 'replacement connects');
    assert.equal(await pane('new-0').locator('iframe').evaluate(node => node.allowFullscreen), site === 'YouTube Shorts');
    assert.equal((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes[0].pinned, true);
  }
  assert.equal(await pane('new-0').locator('.pane-drag-handle').getAttribute('aria-pressed'), 'true');
  await pane('new-1').locator('.pane-close').click();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  for (const site of ['Reddit', 'YouTube Shorts']) {
    await until(() => popup.locator('#add-panel').isEnabled(), Boolean, 'popup has a free slot');
    await popup.locator('#add-panel').click();
    await popup.locator(`.social-option[data-site="${site}"]`).click();
    await until(() => page.locator('.pane[data-status="connected"]').count(), count => count === 3, 'new site added through popup');
    assert.equal(await page.locator('.pane').last().getAttribute('aria-label'), site);
    assert.equal(await popup.locator('#add-panel').isDisabled(), true);
    await page.locator('.pane-close').last().click();
  }
  console.log('PASS new-site replace/add paths preserve pins, restrict fullscreen to YouTube and enforce capacity');
  assert.deepEqual(errors, []);
} finally {
  await context?.close();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert(path.basename(temporary).startsWith('3fingers-social-panels-'));
  await rm(temporary, { recursive: true, force: true });
}
