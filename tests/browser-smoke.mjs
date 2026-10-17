import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFeedServer } from './fixtures/feed-server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(project, 'plans/reports/beta-release/browser');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-browser-'));
let context;
let fixture;
const checks = [];
const errors = [];
const check = (name, detail = {}) => { checks.push({ name, ...detail }); console.log(`PASS ${name}`); };

async function until(read, predicate, label, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`${label}: last observed ${JSON.stringify(value)}`);
}
async function pick(page) {
  if (!await page.locator('#site-picker').evaluate(element => element.matches(':popover-open'))) await page.locator('.pane-select').first().click();
}
function socialChromeFixture(host) {
  const base = '<meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}a{display:inline-block;padding:12px}#mock-feed{height:2200px;background:#fff}</style>';
  if (host === 'www.facebook.com') return `${base}
    <div id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:56px;background:#ddd"><div role="navigation" style="height:56px"><a href="/">Home</a></div></div>
    <div style="height:56px"></div><main role="main" id="mock-feed"><a href="/watch">Post</a></main>
    <div id="mock-message" role="button" aria-label="Tin nhắn mới" style="position:fixed;right:16px;bottom:16px;width:48px;height:48px;background:#ddd"></div>`;
  if (host === 'www.instagram.com') return `${base}
    <header id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:60px;background:#ddd"><a href="/">Home</a></header>
    <div id="mock-bottom" style="position:fixed;bottom:0;left:0;width:100%;height:50px;background:#ddd"><a href="/">1</a><a href="/">2</a><a href="/">3</a><a href="/">4</a></div>
    <div style="height:45px"></div><main role="main" id="mock-feed"><article>Post</article></main>`;
  return `${base}
    <header id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:60px;background:#ddd"><a href="/">Home</a></header>
    <nav id="mock-bottom" style="position:fixed;bottom:0;left:0;width:100%;height:50px;background:#ddd"><a href="/">1</a><a href="/">2</a><a href="/">3</a><a href="/">4</a></nav>
    <div style="height:60px"></div><div id="barcelona-page-layout" style="height:2200px"><div data-pagelet="feed">Post</div></div>`;
}

try {
  await mkdir(artifacts, { recursive: true });
  fixture = await startFeedServer();
  const extension = path.join(temporary, 'extension');
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // Pre-grant only the local fixture host in a throwaway test package. Native permission
  // prompts cannot be driven by Playwright. All production JS/CSS is copied unchanged.
  manifest.host_permissions = [...(manifest.host_permissions || []), 'http://127.0.0.1/*',
    'https://www.facebook.com/*', 'https://www.instagram.com/*', 'https://www.threads.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const launchBrowser = () => chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context = await launchBrowser();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.route(/^https:\/\/www\.(facebook|instagram|threads)\.com\//,route=>route.fulfill({
    status:200,contentType:'text/html',body:socialChromeFixture(new URL(route.request().url()).hostname)}));
  const extensionId = new URL(worker.url()).host;
  const workspace = await context.newPage();
  workspace.on('pageerror', error => errors.push(error.message));
  await workspace.goto(`chrome-extension://${extensionId}/workspace.html`);
  await until(() => workspace.locator('.pane').count(), value => value === 3, 'three default panes');
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes.map(pane => pane.url),
    ['https://www.facebook.com/', 'https://www.threads.com/', 'https://www.instagram.com/']);
  check('manifest loads and workspace has three default panes');
  await workspace.screenshot({path:path.join(artifacts,'first-open.png')});
  await pick(workspace);await workspace.locator('.social-option[data-site="Facebook"]').click();
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','current unopened social selected');
  assert.equal(await workspace.locator('.pane-frame').count(),1);
  check('selecting current unopened social requests access and opens only that panel');

  const urls = [`${fixture.origin}/feed/a`, `${fixture.origin}/feed/b?nested=1`, `${fixture.origin}/feed/c?nested=1`];
  await worker.evaluate(urls => chrome.storage.local.set({ workspace: {
    panes: urls.map((url, index) => ({id:'fixture-' + index,url,enabled:true,weight:index+1})), sync:true,
  }, workspaceOverflow: [] }), urls);
  await workspace.reload();
  await until(() => workspace.frames().filter(frame => urls.includes(frame.url())).length, value => value === 3, 'fixture frames');
  const frames = urls.map(url => workspace.frames().find(frame => frame.url() === url));
  for (const frame of frames) await frame.locator('#feed article').first().waitFor();
  await until(() => workspace.locator('.pane').evaluateAll(panes => panes.map(pane => pane.dataset.status)),
    statuses => statuses.every(status => status === 'connected'), 'all frame handshakes complete');
  assert.equal(await workspace.locator('.pane-url').count(), 0);
  assert.equal(await workspace.locator('.pane-status').first().isVisible(), false);
  assert.equal(await workspace.locator('#reading-toggle').count(), 0);
  assert.equal(await workspace.locator('#manage-toggle,#management').count(),0);
  assert.equal(await workspace.locator('.pane-toolbar').first().evaluate(element=>element.getBoundingClientRect().height),32);
  check('connected workspace has 32px panel toolbars and no management control');
  await workspace.evaluate(()=>document.fonts.ready);
  assert.equal(await workspace.locator('.brand-mark').evaluate(node=>node.complete&&node.naturalWidth===32),true);
  const workspaceFontFamily=await workspace.locator('.toolbar').evaluate(node=>getComputedStyle(node).fontFamily);
  assert.equal(workspaceFontFamily.split(',')[0].trim().replaceAll('"',''),'Ubuntu',workspaceFontFamily);
  await workspace.evaluate(()=>{
    const probe=document.createElement('p');probe.id='font-probe';probe.textContent='Tiếng Việt: 3 ngón tay — Đồng bộ cuộn Ỳ ỳ Ỵ ỵ Ỷ ỷ Ỹ ỹ';
    probe.style.cssText='position:fixed;bottom:0;left:0;z-index:10;background:white;font:20px Ubuntu,system-ui';document.body.append(probe);
  });
  const fontsSession=await context.newCDPSession(workspace);
  await fontsSession.send('DOM.enable');await fontsSession.send('CSS.enable');
  const {root:fontDocument}=await fontsSession.send('DOM.getDocument');
  const {nodeId:fontNode}=await fontsSession.send('DOM.querySelector',{nodeId:fontDocument.nodeId,selector:'#font-probe'});
  const fontUsage=await fontsSession.send('CSS.getPlatformFontsForNode',{nodeId:fontNode});
  assert(fontUsage.fonts.some(font=>font.familyName==='Ubuntu'&&font.isCustomFont));
  assert(fontUsage.fonts.some(font=>!font.isCustomFont&&font.glyphCount>0),'unsupported Vietnamese glyphs must use a system fallback');
  await writeFile(path.join(artifacts,'font-usage.json'),JSON.stringify(fontUsage,null,2));
  await workspace.screenshot({path:path.join(artifacts,'vietnamese-font.png')});
  await workspace.locator('#font-probe').evaluate(node=>node.remove());await fontsSession.detach();
  check('official logo and bundled Ubuntu render with Vietnamese glyph fallback');
  assert.equal(await workspace.locator('.sync-control').innerText(),'');
  assert.equal(await workspace.locator('#sync-toggle').getAttribute('aria-label'),'Đồng bộ cuộn');
  assert.equal(await workspace.locator('#add-slot').count(),0);
  assert.equal(await workspace.locator('#add-panel').isDisabled(),true);
  assert(Number(await workspace.locator('#add-panel').evaluate(node=>getComputedStyle(node).opacity))<.5);
  const addPosition=await workspace.locator('#add-panel').boundingBox(),syncPosition=await workspace.locator('.sync-control').boundingBox();
  assert(addPosition.x>=syncPosition.x+syncPosition.width);
  const gripDots=await workspace.locator('.pane-drag-handle').first().locator('circle').evaluateAll(dots=>dots.map(dot=>({x:dot.cx.baseVal.value,y:dot.cy.baseVal.value})));
  assert.equal(gripDots.length,6);assert.equal(new Set(gripDots.map(dot=>dot.x)).size,3);assert.equal(new Set(gripDots.map(dot=>dot.y)).size,2);
  assert.equal(await workspace.locator('.pane-drag-handle').first().evaluate(node=>getComputedStyle(node).color),'rgb(17, 17, 17)');
  await pick(workspace);
  const anchor=await workspace.locator('.pane-select').first().boundingBox(),dropdown=await workspace.locator('#site-picker').boundingBox();
  assert(Math.abs(dropdown.y-anchor.y-anchor.height-4)<2);
  assert(Math.abs(dropdown.x+dropdown.width-anchor.x-anchor.width)<2);
  assert.equal((await workspace.locator('#site-picker').innerText()).trim().replace(/\s+/g,' '),'Facebook Instagram Threads');
  await workspace.keyboard.press('ArrowDown');
  assert.equal(await workspace.locator('.social-option[data-site="Instagram"]').evaluate(node=>document.activeElement===node),true);
  await workspace.keyboard.press('End');
  assert.equal(await workspace.locator('.social-option[data-site="Threads"]').evaluate(node=>document.activeElement===node),true);
  await workspace.keyboard.press('Escape');
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false);
  assert.equal(await workspace.locator('.pane-select').first().evaluate(node=>document.activeElement===node),true);
  await pick(workspace);await workspace.locator('.brand').click();
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false);
  await pick(workspace);await workspace.locator('.pane-select').first().click();
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false,'clicking the same trigger toggles the dropdown closed');
  check('horizontal black grip, icon-only toolbar and anchored list-only dropdown support keyboard and outside dismissal');
  await workspace.locator('.pane-drag-handle').first().hover();
  await workspace.screenshot({path:path.join(artifacts,'toolbar-hover.png'),clip:{x:0,y:0,width:1440,height:56}});
  for (const frame of frames) {
    assert.equal(await frame.locator('header').isVisible(), true);
    assert.equal(await frame.locator('#native-editor').isVisible(), true);
    assert.equal(await frame.locator('[data-three-fingers-reader]').count(), 0);
    assert.equal(await frame.evaluate(() => typeof globalThis.createThreeFingersReader), 'undefined');
    assert.equal(await frame.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(248, 250, 252)');
  }
  check('native site chrome, inputs and background remain unchanged without a reader script');
  assert.equal(await frames[0].evaluate(() => getComputedStyle(document.scrollingElement).scrollbarWidth), 'none');
  assert.equal(await frames[1].evaluate(() => getComputedStyle(document.querySelector('#feed')).scrollbarWidth), 'none');
  check('feed scrollbars are hidden on document and nested roots without altering native page chrome');
  check('three real HTTP frames load despite XFO DENY and CSP frame-ancestors none');
  await until(() => worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()),
    rules => rules.length > 0, 'session rules present');
  const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  assert(rules.every(rule => rule.condition.tabIds?.length && rule.condition.resourceTypes?.every(type => type === 'sub_frame')));
  check('compatibility rules restricted to workspace tab and sub_frame', { rules });

  const outside = await context.newPage();
  await outside.goto(`${fixture.origin}/outside`);
  await outside.waitForLoadState('networkidle');
  const outsideFrame = outside.frames().find(frame => frame !== outside.mainFrame());
  assert(!outsideFrame || !await outsideFrame.locator('#feed').count());
  check('same-host iframe outside workspace remains blocked');
  await outside.close();

  const toggle = workspace.locator('#sync-toggle');
  if (await toggle.getAttribute('aria-pressed') === 'true' || await toggle.isChecked().catch(() => false)) await toggle.click();
  await frames[0].evaluate(() => window.scrollTo(0, 1000));
  await frames[1].evaluate(() => document.querySelector('#feed').scrollTop = 500);
  await frames[2].evaluate(() => document.querySelector('#feed').scrollTop = 700);
  await workspace.locator('.pane-frame').nth(2).evaluate(element => element.style.height = '500px');
  await until(() => frames[2].evaluate(() => innerHeight), height => height === 500, 'resized frame viewport applied');
  const state = () => Promise.all(frames.map((frame, index) => frame.evaluate(index => {
    const feed = index === 0 ? document.scrollingElement : document.querySelector('#scroll-container, #feed');
    return { top: feed.scrollTop, height: index === 0 ? innerHeight : feed.clientHeight };
  }, index)));
  const before = await state();
  await toggle.click();
  const sourceBox = await workspace.locator('.pane-frame').first().boundingBox();
  await workspace.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await workspace.mouse.wheel(0, 240);
  await until(state, values => values[0].top > before[0].top + 100 && values[1].top > before[1].top + 50 && values[2].top > before[2].top + 50,
    'source and followers scroll');
  let lastPositions, stableSamples = 0;
  const after = await until(state, values => {
    const positions = JSON.stringify(values);
    stableSamples = positions === lastPositions ? stableSamples + 1 : 0;
    lastPositions = positions;
    return stableSamples >= 3;
  }, 'source and followers settle before comparing viewport deltas');
  const fraction = (after[0].top - before[0].top) / before[0].height;
  for (let index = 1; index < 3; index++) {
    const expected = before[index].top + fraction * before[index].height;
    assert(Math.abs(after[index].top - expected) < 12, `panel ${index}: expected ${expected}, observed ${after[index].top}`);
  }
  check('viewport-normalized scroll preserves independent offsets at unequal viewport heights', { before, after, fraction });
  const beforeShift = await state();
  await frames[0].evaluate(() => {
    const article = document.createElement('article');
    article.textContent = 'Layout-shift fixture inserted above the viewport';
    document.querySelector('#feed').prepend(article);
  });
  await until(state, values => values[0].top > beforeShift[0].top + 100, 'native source scroll anchoring');
  await new Promise(resolve => setTimeout(resolve, 100));
  const afterShift = await state();
  assert.equal(afterShift[1].top, beforeShift[1].top, 'source layout shift must not become follower scroll');
  assert.equal(afterShift[2].top, beforeShift[2].top, 'source layout shift must not become follower scroll');
  check('content inserted above viewport does not scroll followers');
  const stable = await state();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.deepEqual((await state()).map(value => value.top), stable.map(value => value.top));
  check('followers do not echo or drift after scroll settles');

  await frames[1].locator('#open-dialog').click();
  assert.notEqual(await frames[1].locator('#dialog').evaluate(element => getComputedStyle(element).scrollbarWidth), 'none');
  const modal = await frames[1].locator('#dialog').boundingBox();
  const priorDialog = await state();
  await workspace.mouse.move(modal.x + 40, modal.y + 40);
  await workspace.mouse.wheel(0, 160);
  await until(() => frames[1].locator('#dialog').evaluate(element => element.scrollTop), top => top > 0, 'dialog scroll');
  assert.deepEqual((await state()).map(value => value.top), priorDialog.map(value => value.top));
  check('dialog scroll does not move other feeds');

  await frames[1].locator('#dialog').evaluate(element => element.scrollTop = 0);
  await frames[1].locator('#close-dialog').click();
  const returned = await state();
  const feedBox = await frames[1].locator('#feed').boundingBox();
  await workspace.mouse.move(feedBox.x + feedBox.width / 2, feedBox.y + feedBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[1].top > returned[1].top + 100 && values[0].top > returned[0].top + 50,
    'sync resumes after comments close and old feed stays connected');
  check('sync resumes after closing comments with a retained inactive feed');

  await frames[1].locator('#open-dialog').click();
  const blocked = await state();
  await workspace.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await workspace.mouse.wheel(0, 150);
  await until(state, values => values[0].top > blocked[0].top + 80 && values[2].top > blocked[2].top + 40, 'unblocked feeds scroll');
  assert.equal((await state())[1].top, blocked[1].top, 'modal must keep its background feed still');
  await frames[1].locator('#close-dialog').click();
  const reopened = await state();
  await workspace.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await workspace.mouse.wheel(0, 150);
  await until(state, values => values[1].top > reopened[1].top + 60, 'closed modal follower resumes');
  check('modal pauses its background follower and closing it resumes sync');

  await frames[1].evaluate(() => {
    const feed = document.querySelector('#feed');
    const offset = feed.scrollTop;
    const wrapper = document.createElement('section');
    wrapper.id = 'scroll-container';
    wrapper.style.cssText = 'height:calc(100vh - 80px);overflow-y:auto';
    feed.before(wrapper);wrapper.append(feed);
    feed.style.height = 'auto';feed.style.overflowY = 'visible';
    wrapper.scrollTop = offset;
  });
  const changedOverflow = await state();
  const wrapperBox = await frames[1].locator('#scroll-container').boundingBox();
  await workspace.mouse.move(wrapperBox.x + wrapperBox.width / 2, wrapperBox.y + wrapperBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[1].top > changedOverflow[1].top + 100 && values[0].top > changedOverflow[0].top + 50,
    'CSS overflow change reselects scroll container');
  check('CSS overflow transition recovers sync without navigation or reload');

  await frames[2].evaluate(() => {
    const old = document.querySelector('#feed');
    old.addEventListener('scroll', () => {
      const next = old.cloneNode(true);
      const offset = old.scrollTop;
      old.id = 'queued-old-feed';old.className = 'inactive-feed';
      old.after(next);next.scrollTop = offset;
      window.rootSwapOffset = offset;
    }, {once:true});
  });
  const beforeSwap = await state();
  const swapBox = await frames[2].locator('#feed').boundingBox();
  await workspace.mouse.move(swapBox.x + swapBox.width / 2, swapBox.y + swapBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(() => frames[2].evaluate(() => window.rootSwapOffset), value => value > beforeSwap[2].top + 100, 'feed swapped during scroll dispatch');
  await workspace.waitForTimeout(200);
  const afterSwap = await state();
  assert.equal(afterSwap[0].top, beforeSwap[0].top, 'discard the outgoing root delta before its scheduled broadcast');
  assert.equal(afterSwap[1].top, beforeSwap[1].top, 'root swap must not emit pending stale delta');
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[0].top > afterSwap[0].top + 100 && values[2].top > afterSwap[2].top + 100, 'replacement feed resumes after stale queue cleared');
  check('root replacement discards queued stale deltas and subsequent gestures resume');

  await frames[0].evaluate(() => document.body.style.overflowY = 'hidden');
  const locked = await state();
  await workspace.mouse.move(wrapperBox.x + wrapperBox.width / 2, wrapperBox.y + wrapperBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[1].top > locked[1].top + 100 && values[2].top > locked[2].top + 50, 'unlocked feeds scroll with one locked document');
  assert.equal((await state())[0].top, locked[0].top, 'no eligible root means the overflow-locked document stays still');
  await frames[0].evaluate(() => document.body.style.overflowY = '');
  const unlocked = await state();
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[0].top > unlocked[0].top + 100, 'unlocked document resumes as follower');
  check('overflow-locked document without a modal pauses and unlocking resumes sync');

  await toggle.click();
  const paused = await state();
  await workspace.mouse.move(sourceBox.x + 40, sourceBox.y + sourceBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[0].top > paused[0].top + 100, 'paused source scroll');
  assert.equal((await state())[1].top, paused[1].top);
  check('Sync Scroll toggle pauses followers');


  await workspace.locator('.pane-frame').nth(2).evaluate(element => element.style.height = '100%');
  if (!await toggle.isChecked()) await toggle.check();
  await until(() => worker.evaluate(() => chrome.storage.session.get('sessions')),
    result => Object.values(result.sessions).some(session => session.sync), 'sync enabled for gesture tests');
  for (const selector of ['.pane-heading','.resize-handle','.pane-url','#reset-widths','#hide-site-chrome']) {
    assert.equal(await workspace.locator(selector).count(), 0);
  }
  const equalWidths = await workspace.locator('.pane').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  assert(Math.max(...equalWidths) - Math.min(...equalWidths) <= 1);
  assert((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes.every(pane => !Object.hasOwn(pane,'weight')));
  check('equal widths preserve compact panel toolbars without resize or retired name bars');


  assert.equal(await workspace.locator('.pan-toggle,.pan-overlay,#site-list .drag-handle').count(),0);
  const beforeDrag=await state();
  const grab=await workspace.locator('.pane-frame').first().boundingBox();
  await workspace.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);
  await workspace.mouse.down();await workspace.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2-160,{steps:8});await workspace.mouse.up();
  await until(state,values=>values[0].top>beforeDrag[0].top+120,'default grab scrolls target');
  await workspace.waitForTimeout(250);
  assert.deepEqual((await state()).slice(1).map(value=>value.top),beforeDrag.slice(1).map(value=>value.top));
  check('default vertical drag scrolls one feed without toggles or follower echo');

  const touchSession = await context.newCDPSession(workspace), touchBefore = await state();
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchPoint = { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 };
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
  for (let step = 1; step <= 8; step++) {
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touchPoint, y: touchPoint.y - step * 20 }] });
    await workspace.waitForTimeout(20);
  }
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(state, values => values[0].top > touchBefore[0].top + 80, 'native touch swipe');
  await workspace.waitForTimeout(500);
  assert.deepEqual((await state()).slice(1).map(value => value.top), touchBefore.slice(1).map(value => value.top));
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touchSession.detach();
  check('native touchscreen swipe scrolls only its feed while Sync Scroll is enabled');

  await frames[0].evaluate(()=>{
    const link=document.createElement('a');link.id='native-link';link.href='#native-click';
    link.style.cssText='position:fixed;left:80px;top:200px;width:220px;height:120px;background:white';
    const image=document.createElement('img');image.width=220;image.height=120;
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120"><rect width="220" height="120" fill="gray"/></svg>');
    link.append(image);link.addEventListener('click',event=>{event.preventDefault();window.nativeClicks=(window.nativeClicks||0)+1});document.body.append(link);
  });
  await frames[0].locator('#native-link').click();
  assert.equal(await frames[0].evaluate(()=>window.nativeClicks),1);
  const imageBox=await frames[0].locator('#native-link').boundingBox(),imageBefore=await state();
  await workspace.mouse.move(imageBox.x+100,imageBox.y+90);await workspace.mouse.down();
  await workspace.mouse.move(imageBox.x+100,imageBox.y+10,{steps:8});await workspace.mouse.up();
  await until(state,values=>values[0].top>imageBefore[0].top+60,'image swipe scrolls');
  assert.equal(await frames[0].evaluate(()=>window.nativeClicks),1,'drag must not activate the image link');
  await frames[0].locator('#native-link').click();
  assert.equal(await frames[0].evaluate(()=>window.nativeClicks),2,'a fresh click immediately after a swipe must work');
  await frames[0].locator('#native-link').evaluate(element=>element.remove());
  await frames[0].locator('#native-editor').fill('Native input still works');
  assert.equal(await frames[0].locator('#native-editor').inputValue(),'Native input still works');
  check('click without drag and input work; dragging an image link does not activate it');

  // Focusing the composer can scroll it into view asynchronously. Measure the
  // next gesture only after that native focus scroll has finished.
  let focusPositions, focusSamples = 0;
  const wheelBefore = await until(state, values => {
    const positions = values.map(value => value.top).join(',');
    focusSamples = positions === focusPositions ? focusSamples + 1 : 0;
    focusPositions = positions;
    return focusSamples >= 4;
  }, 'composer focus scrolling settled');
  await workspace.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);await workspace.mouse.wheel(0,180);
  await until(state,values=>values[0].top>wheelBefore[0].top+100&&values[1].top>wheelBefore[1].top+60,'native wheel sync');
  const keyBefore=await state();
  await frames[0].locator('body').evaluate(element=>element.tabIndex=0);
  await frames[0].locator('body').press('PageDown');
  await until(state,values=>values[0].top>keyBefore[0].top+200&&values[1].top>keyBefore[1].top+100,'native key sync');
  check('wheel and keyboard continue Sync Scroll after a local swipe');

  // Native PageDown animates over several frames; wait for it and its followers
  // to finish before asserting that the next unrelated gesture stays local.
  let settledPositions, settledSamples = 0;
  await until(state, values => {
    const positions = values.map(value => value.top).join(',');
    settledSamples = positions === settledPositions ? settledSamples + 1 : 0;
    settledPositions = positions;
    return settledSamples >= 4;
  }, 'native keyboard scrolling settled');
  const nestedBefore=await state();
  await frames[0].evaluate(()=>{
    const nested=document.createElement('div');nested.id='grab-nested';
    nested.style.cssText='position:fixed;top:calc(50% - 100px);left:0;width:100%;height:200px;overflow:auto;background:white';
    const content=document.createElement('div');content.style.height='1000px';nested.append(content);document.body.append(nested);
  });
  const nestedBox=await frames[0].locator('#grab-nested').boundingBox();
  await workspace.mouse.move(nestedBox.x+100,nestedBox.y+140);await workspace.mouse.down();
  await workspace.mouse.move(nestedBox.x+100,nestedBox.y+60,{steps:4});await workspace.mouse.up();
  assert.deepEqual((await state()).map(value=>value.top),nestedBefore.map(value=>value.top));
  await workspace.mouse.wheel(0,140);
  await until(()=>frames[0].locator('#grab-nested').evaluate(element=>element.scrollTop),top=>top>50,'nested native wheel');
  assert.deepEqual((await state()).map(value=>value.top),nestedBefore.map(value=>value.top));
  await frames[0].locator('#grab-nested').evaluate(element=>element.remove());
  check('nested content retains native interaction without dragging its background feed');

  await frames[1].locator('#open-dialog').click();
  const modalBefore=await state(),modalBox=await frames[1].locator('#dialog').boundingBox();
  await workspace.mouse.move(modalBox.x+100,modalBox.y+140);await workspace.mouse.down();
  await workspace.mouse.move(modalBox.x+100,modalBox.y+60,{steps:4});await workspace.mouse.up();
  assert.deepEqual((await state()).map(value=>value.top),modalBefore.map(value=>value.top));
  await frames[1].locator('#close-dialog').click();
  check('modal interaction does not swipe background feeds');

  await workspace.mouse.move(grab.x+100,grab.y+300);await workspace.mouse.down();
  await workspace.mouse.move(grab.x+100,grab.y+270,{steps:3});
  await until(()=>frames[0].evaluate(()=>document.documentElement.hasAttribute('data-three-fingers-grabbing')),Boolean,'swipe active');
  await frames[0].evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await workspace.mouse.up();
  assert.equal(await frames[0].evaluate(()=>document.documentElement.hasAttribute('data-three-fingers-grabbing')),false);
  check('pointer cancellation restores native selection and cursor');

  const orderRequests=fixture.requests.length,orderOffsets=(await state()).map(value=>value.top);
  const orderHandle=workspace.locator('.pane-drag-handle').first(),handleBox=await orderHandle.boundingBox();
  await workspace.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);await workspace.mouse.down();
  await workspace.mouse.move(handleBox.x+handleBox.width/2+500,handleBox.y+handleBox.height/2+130,{steps:12});
  await workspace.waitForTimeout(200);
  const floating=await workspace.locator('.pane.is-dragging').evaluate(element=>({width:element.getBoundingClientRect().width,layoutWidth:element.offsetWidth,top:element.getBoundingClientRect().top}));
  assert(floating.width > floating.layoutWidth*.94 && floating.width < floating.layoutWidth*.98);
  assert(floating.top > handleBox.y+100);
  assert.deepEqual((await state()).map(value=>value.height),beforeDrag.map(value=>value.height));
  await until(()=>workspace.locator('.pane').evaluateAll(elements=>elements.map(element=>element.dataset.paneId)),
    ids=>ids.join(',')==='fixture-1,fixture-0,fixture-2','live reorder preview before release');
  assert.equal(fixture.requests.length,orderRequests);
  assert(frames.every(frame=>workspace.frames().includes(frame)));
  assert.deepEqual((await state()).map(value=>value.top),orderOffsets);
  assert.equal(await workspace.locator('#sync-toggle').isDisabled(),true);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes[0].id,'fixture-0','preview must not save before drop');
  await workspace.screenshot({path:path.join(artifacts,'reorder-preview.png')});
  await workspace.mouse.up();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),
    data=>data.workspace.panes[0].id==='fixture-1','drop order saved');
  check('scaled panel follows pointer in both axes, previews before drop and keeps iframe viewport, documents and offsets');

  const cancelHandle=await workspace.locator('.pane-drag-handle').nth(1).boundingBox();
  await workspace.mouse.move(cancelHandle.x+cancelHandle.width/2,cancelHandle.y+cancelHandle.height/2);await workspace.mouse.down();
  await workspace.mouse.move(cancelHandle.x-480,cancelHandle.y+cancelHandle.height/2,{steps:10});
  await until(()=>workspace.locator('.pane').first().getAttribute('data-pane-id'),id=>id==='fixture-0','cancel preview changed');
  await workspace.keyboard.press('Escape');await workspace.mouse.up();
  assert.equal(await workspace.locator('.pane').first().getAttribute('data-pane-id'),'fixture-1');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes[0].id,'fixture-1');
  await workspace.locator('.pane-drag-handle').nth(1).press('ArrowLeft');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-pane-id'),id=>id==='fixture-0','direct keyboard reorder');
  assert.equal(fixture.requests.length,orderRequests);
  assert.deepEqual((await state()).map(value=>value.top),orderOffsets);
  check('Escape rolls back live preview; direct handle keyboard ordering preserves frame state');
  assert.equal(await workspace.locator('#add-panel').isVisible(),true);
  assert.equal(await workspace.locator('#add-panel').isDisabled(),true);
  const fourthPane=await workspace.evaluate(async()=>chrome.runtime.sendMessage({type:'configure',sync:true,
    panes:['a','b','c','d'].map(id=>({id,url:'https://example.com/',enabled:false}))}));
  assert.equal(fourthPane.ok,false);
  check('fourth pane is rejected in chooser UI and background contract');
  await workspace.screenshot({path:path.join(artifacts,'panel-controls.png')});
  await workspace.locator('.pane-drag-handle').first().press('ArrowRight');
  await workspace.reload();
  await until(()=>workspace.locator('.pane').evaluateAll(elements=>elements.map(element=>element.dataset.paneId)),
    ids=>ids.join(',')==='fixture-1,fixture-0,fixture-2','order persisted after reload');
  check('dragged order persists across reload');

  urls[2]=fixture.origin+'/redirect';
  await worker.evaluate(urls=>chrome.storage.local.set({workspace:{panes:urls.map((url,index)=>({id:'fixture-'+index,url,enabled:true})),sync:true}}),urls);
  await workspace.reload();
  await until(()=>workspace.locator('.pane').nth(2).getAttribute('data-status'),value=>value==='connected','redirect connected');
  await until(()=>workspace.frames().some(frame=>frame.url()===fixture.origin+'/feed/redirected?nested=1'),Boolean,'redirected document');
  check('server redirect within granted site keeps scroll connection');
  const navigationBox=await workspace.locator('.pane-frame').first().boundingBox();
  await workspace.mouse.move(navigationBox.x+100,navigationBox.y+300);await workspace.mouse.down();
  await workspace.mouse.move(navigationBox.x+100,navigationBox.y+270,{steps:3});
  const previousDocument=await workspace.locator('.pane').first().getAttribute('data-pane-id');
  const previousFrameDocument=await worker.evaluate(async id=>Object.values((await chrome.storage.session.get('sessions')).sessions).flatMap(session=>session.panes).find(pane=>pane.id===id)?.documentId,previousDocument);
  const activeFrame=workspace.frames().find(frame=>frame.url()===urls[0]);
  await activeFrame.evaluate(()=>location.reload());
  await workspace.mouse.up();
  await until(()=>worker.evaluate(async id=>Object.values((await chrome.storage.session.get('sessions')).sessions).flatMap(session=>session.panes).find(pane=>pane.id===id)?.documentId,previousDocument),
    documentId=>documentId&&documentId!==previousFrameDocument,'navigation document replaced');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','navigation reconnects');
  assert.equal(await workspace.locator('.pane').first().getAttribute('data-pane-id'),previousDocument);
  check('iframe navigation replaces active swipe and reconnects with a new document');

  for(const [width,height] of [[1440,900],[768,1024],[375,812]]) {
    await workspace.setViewportSize({width,height});
    await workspace.screenshot({path:path.join(artifacts,'workspace-'+width+'.png')});
    const diagnostics=await workspace.evaluate(()=>({
      viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,
      toolbarHeight:document.querySelector('.toolbar').getBoundingClientRect().height,
      feedHeight:document.querySelector('.pane-frame').getBoundingClientRect().height,
      controls:[...document.querySelectorAll('.toolbar button,.sync-control')].map(element=>{
        const rect=element.getBoundingClientRect();return{height:rect.height,left:rect.left,right:rect.right};
      }),
      widths:[...document.querySelectorAll('.pane')].map(element=>element.getBoundingClientRect().width),
    }));
    assert(diagnostics.bodyWidth<=width);
    assert(diagnostics.toolbarHeight<=64);
    assert(diagnostics.controls.every(control=>control.height>=44&&control.left>=0&&control.right<=width));
    assert(diagnostics.feedHeight>height*.8);
    assert(Math.max(...diagnostics.widths)-Math.min(...diagnostics.widths)<=1);
    await pick(workspace);
    const menuRect=await workspace.locator('#site-picker').boundingBox();
    assert(menuRect.x>=0&&menuRect.x+menuRect.width<=width);
    assert(menuRect.y>=0&&menuRect.y+menuRect.height<=height);
    await workspace.screenshot({path:path.join(artifacts,'picker-'+width+'.png')});
    assert.equal(await workspace.locator('#site-picker').evaluate(element=>element.scrollWidth<=element.clientWidth),true);
    await workspace.keyboard.press('Escape');
    await writeFile(path.join(artifacts,'layout-'+width+'.json'),JSON.stringify(diagnostics,null,2));
  }
  check('equal columns, compact panel controls and picker fit desktop, tablet and narrow viewports');
  await workspace.setViewportSize({width:1440,height:900});

  await worker.evaluate(()=>chrome.storage.local.set({workspace:{
    panes:[{id:'saved-x',url:'https://x.com/',enabled:false,weight:2},{id:'saved-custom',url:'https://example.org/',enabled:false,weight:1}],
    sync:false,reading:true,hideSiteChrome:true},workspaceOverflow:[]}));
  await workspace.reload();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'custom panels preserved');
  const restoredWorkspace=(await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  assert.deepEqual(restoredWorkspace.panes.map(pane=>pane.url),['https://x.com/','https://example.org/']);
  assert.equal(restoredWorkspace.sync,false);
  assert.equal(Object.hasOwn(restoredWorkspace,'reading'),false);
  assert.equal(Object.hasOwn(restoredWorkspace,'hideSiteChrome'),false);
  assert(restoredWorkspace.panes.every(pane=>!Object.hasOwn(pane,'weight')));
  check('legacy custom URLs and Sync Scroll survive while retired width and chrome settings are removed');

  const archivedUrl=fixture.origin+'/feed/d';
  await worker.evaluate(archivedUrl=>chrome.storage.local.set({workspace:{panes:[
    {id:'old-a',url:'https://example.com/',enabled:false,weight:1},
    {id:'old-b',url:'https://example.org/',enabled:false,weight:2},
    {id:'old-c',url:'https://example.net/',enabled:false,weight:3},
    {id:'old-d',url:archivedUrl,enabled:false,weight:4}],sync:true},workspaceOverflow:[]}),archivedUrl);
  await workspace.reload();
  await until(()=>workspace.locator('.pane').count(),value=>value===3,'legacy three visible');
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('workspaceOverflow'))).workspaceOverflow.map(pane=>pane.url),[archivedUrl]);
  await workspace.locator('.pane-close').last().click();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'free archive slot');
  await workspace.locator('#add-panel').click();
  await workspace.locator('.archive-restore').click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get(['workspace','workspaceOverflow'])),
    value=>value.workspace.panes.some(pane=>pane.id==='old-d')&&value.workspaceOverflow.length===0,'archive restored atomically');
  check('surplus legacy URL is archived and restored into a free slot');

  const socialUrls=['https://www.facebook.com/','https://www.instagram.com/','https://www.threads.com/'];
  await worker.evaluate(socialUrls=>chrome.storage.local.set({workspace:{
    panes:socialUrls.map((url,index)=>({id:'social-'+index,url,enabled:true,weight:1})),sync:true,hideSiteChrome:true}}),socialUrls);
  await workspace.reload();
  await until(()=>workspace.locator('.pane').evaluateAll(panes=>panes.map(pane=>pane.dataset.status)),
    statuses=>statuses.length===3&&statuses.every(status=>status==='connected'),'social fixture connections');
  const socialFrames=socialUrls.map(url=>workspace.frames().find(frame=>frame.url()===url));
  for(const frame of socialFrames) {
    assert.equal(await frame.locator('#mock-top').evaluate(element=>getComputedStyle(element).visibility),'visible');
    assert.equal(await frame.evaluate(()=>getComputedStyle(document.scrollingElement).scrollbarWidth),'none');
    assert.equal(await frame.evaluate(()=>document.querySelectorAll('[data-three-fingers-site-bar],[data-three-fingers-site-main]').length),0);
  }
  for(const frame of socialFrames.slice(1))assert.equal(await frame.locator('#mock-bottom').evaluate(element=>getComputedStyle(element).visibility),'visible');
  assert.equal(await socialFrames[0].locator('#mock-message').isVisible(),true);
  check('upgrade removes site-navigation suppression while retaining only feed scrollbar styling');

  await socialFrames[1].evaluate(()=>window.retainedDocument='instagram');
  await socialFrames[2].evaluate(()=>window.retainedDocument='threads');
  const retainedHandles = await workspace.locator('.pane-frame').all();
  const reloadedElement = await retainedHandles[0].elementHandle();
  const untouchedElements = await Promise.all(retainedHandles.slice(1).map(frame=>frame.elementHandle()));
  await workspace.locator('.pane-reload').first().click();
  await until(()=>reloadedElement.evaluate(node=>node.isConnected),connected=>!connected,'reload replaces target iframe');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','panel reload connected');
  assert.equal(await socialFrames[1].evaluate(()=>window.retainedDocument),'instagram');
  assert.equal(await socialFrames[2].evaluate(()=>window.retainedDocument),'threads');
  for (const element of untouchedElements) assert.equal(await element.evaluate(node=>node.isConnected),true);
  check('panel reload reconnects its feed without replacing other documents');

  const firstId=await workspace.locator('.pane').first().getAttribute('data-pane-id');
  await pick(workspace);
  assert.equal(await workspace.locator('.social-option').first().isEnabled(),true,'switch is available with three panels');
  await workspace.locator('.social-option[data-site="Instagram"]').click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].url===socialUrls[1],'social switch saved');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','switched feed connected');
  assert.equal(await workspace.locator('.pane').count(),3);
  assert.equal(await workspace.locator('.pane').first().getAttribute('data-pane-id'),firstId);
  assert.equal(await socialFrames[1].evaluate(()=>window.retainedDocument),'instagram');
  assert.equal(await socialFrames[2].evaluate(()=>window.retainedDocument),'threads');
  const switchedElement=await workspace.locator('.pane-frame').first().elementHandle();
  await pick(workspace);await workspace.locator('.social-option[data-site="Instagram"]').click();
  assert.equal(await switchedElement.evaluate(node=>node.isConnected),true,'selecting current social keeps its document');
  await pick(workspace);await workspace.locator('.social-option[data-site="Facebook"]').click();
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','switch back connected');
  check('chooser replaces only its panel, permits duplicates at capacity and keeps current social on reselect');

  await workspace.locator('.pane-close').last().click();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'chooser free slot');
  await workspace.locator('#add-panel').click();
  assert.deepEqual(await workspace.locator('.social-option').evaluateAll(buttons=>buttons.map(button=>button.dataset.site)),['Facebook','Instagram','Threads']);
  await workspace.screenshot({path:path.join(artifacts,'social-chooser.png')});
  let controlsSnapshot=await workspace.evaluate(() => {
    const clone=document.documentElement.cloneNode(true);
    for(const script of clone.querySelectorAll('script'))script.remove();
    for(const frame of clone.querySelectorAll('iframe'))frame.remove();
    // This static controls export follows the toolbar's add button at every width.
    clone.querySelector('#site-picker').style.left='auto';
    clone.querySelector('#site-picker').style.right='var(--s5)';
    clone.querySelector('link[rel="stylesheet"]').remove();
    clone.querySelector('#site-picker').style.display='block';
    return clone.outerHTML;
  });
  let stylesheet=await readFile(path.join(project,'extension/workspace.css'),'utf8');
  for(const [,asset] of stylesheet.matchAll(/url\("([^"]+)"\)/g)) {
    const bytes=await readFile(path.join(project,'extension',asset));
    stylesheet=stylesheet.replace(asset,'data:font/ttf;base64,'+bytes.toString('base64'));
  }
  controlsSnapshot=controlsSnapshot.replaceAll('assets/icons/icon-32.png','data:image/png;base64,'+(await readFile(path.join(project,'extension/assets/icons/icon-32.png'))).toString('base64'));
  await writeFile(path.join(artifacts,'render-controls.html'),'<!doctype html>'+controlsSnapshot.replace('</head>','<style>'+stylesheet+'</style></head>'));
  await workspace.evaluate(() => {
    document.querySelector('.social-option[data-site="Facebook"]').click();
    document.querySelector('.social-option[data-site="Instagram"]').click();
  });
  await until(()=>workspace.locator('.pane').last().getAttribute('data-status'),value=>value==='connected','chosen duplicate social loads');
  const chosen=(await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  assert.equal(chosen.panes.filter(pane=>pane.url===socialUrls[0]).length,2);
  assert.equal(chosen.panes.length,3);
  assert.equal(await workspace.locator('input[type="url"]').count(),0);
  check('social chooser supports duplicates with no URL entry and blocks simultaneous additions beyond three');
  assert.equal(await workspace.locator('#site-picker').evaluate(element=>element.matches(':popover-open')),false);

  while(await workspace.locator('.pane').count()) await workspace.locator('.pane-close').first().click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes.length===0,'empty layout saved');
  assert.equal(await workspace.locator('#add-panel').isVisible(),true);
  await workspace.reload();
  assert.equal(await workspace.locator('.pane').count(),0);
  await workspace.locator('#add-panel').click();await workspace.locator('.social-option[data-site="Threads"]').click();
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','add from empty layout');
  assert.equal(await workspace.locator('.pane-drag-handle').first().isDisabled(),true);
  await workspace.screenshot({path:path.join(artifacts,'single-panel.png')});
  await workspace.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await workspace.locator('.pane').first().evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  check('closing all panels persists empty layout; add remains reachable and reduced motion disables transitions');

  const ungranted=await workspace.evaluate(async()=>chrome.runtime.sendMessage({type:'configure',sync:true,
    panes:[{id:'ungranted',url:'https://not-granted.example/',enabled:true}]}));
  assert.equal(ungranted.ok,true);
  assert.equal(ungranted.panes[0].enabled,false);
  assert.equal((await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules())).length,0);
  check('ungranted host is disabled and receives no compatibility rule');
  await workspace.close();
  await until(() => worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()), rules => rules.length === 0, 'rules cleaned after closing workspace');
  check('workspace close removes compatibility rules');
  assert.deepEqual(errors, [], 'workspace uncaught errors');
  check('no uncaught workspace JavaScript errors');

  const persistedBeforeUpdate=(await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  await context.close();context=null;
  manifest.version='0.6.1';manifest.version_name='0.6.1-beta.2';
  await writeFile(manifestPath,JSON.stringify(manifest,null,2));
  context=await launchBrowser();
  await context.route(/^https:\/\/www\.(facebook|instagram|threads)\.com\//,route=>route.fulfill({status:200,contentType:'text/html',body:socialChromeFixture(new URL(route.request().url()).hostname)}));
  const updateWorker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  assert.equal(new URL(updateWorker.url()).host,extensionId);
  const updatedWorkspace=await context.newPage();
  updatedWorkspace.on('pageerror',error=>errors.push(error.message));
  await updatedWorkspace.goto(`chrome-extension://${extensionId}/workspace.html`);
  await until(()=>updatedWorkspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','same-directory update reconnects');
  assert.deepEqual((await updateWorker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace,persistedBeforeUpdate);
  assert.equal(await updateWorker.evaluate(()=>chrome.runtime.getManifest().version),'0.6.1');
  assert.deepEqual(errors,[],'update workspace uncaught errors');
  check('same-directory unpacked version update preserves extension identity and stored workspace');
} finally {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ timestamp:new Date().toISOString(), checks, errors, environment:'Playwright Chromium, temporary headless profile; localhost and three intercepted social origins pre-granted only in test copy; no authenticated social test' }, null, 2)).catch(() => {});
  const cleanupErrors=[];
  if(context) try{await context.close()}catch(error){cleanupErrors.push(error)}
  if(fixture) try{await fixture.close()}catch(error){cleanupErrors.push(error)}
  try {
    assert.equal(path.dirname(path.resolve(temporary)),path.resolve(tmpdir()));
    assert(path.basename(temporary).startsWith('3fingers-browser-'));
    await rm(temporary,{recursive:true,force:true});
  } catch(error){cleanupErrors.push(error)}
  if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Browser test cleanup failed');
}
