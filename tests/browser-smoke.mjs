import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFeedServer } from './fixtures/feed-server.mjs';
import { applySocialTheme } from '../extension/shared/social-theme.js';
import { nativeThemeControls } from './fixtures/native-theme-controls.mjs';
import { builtinThemeControls } from './fixtures/builtin-theme-controls.mjs';

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
  const base = `<html class="__fb-light-mode ${host === 'www.instagram.com' ? '_aa4c' : ''}"><meta charset="utf-8"><style>:root,.__fb-light-mode{--fixture-bg:#fff;--fixture-fg:#1c1c1c}.__fb-dark-mode{--fixture-bg:#181818;--fixture-fg:#eee}body{margin:0;font:16px sans-serif;background:var(--fixture-bg);color:var(--fixture-fg)}a{display:inline-block;padding:12px}#mock-feed{height:2200px;background:var(--fixture-bg)}</style><img id="theme-media" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" width="16" height="16">${builtinThemeControls(host)}`;
  if (host === 'www.facebook.com') return `${base}
    <div id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:56px;background:#ddd"><div role="navigation" style="height:56px"><a href="/">Home</a></div></div>
    <div style="height:56px"></div><main role="main" id="mock-feed"><a href="/watch">Post</a></main>
    <div id="mock-message" role="button" aria-label="Tin nh\u1eafn m\u1edbi" style="position:fixed;right:16px;bottom:16px;width:48px;height:48px;background:#ddd"></div>`;
  if (host === 'www.instagram.com') return `${base}
    <header id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:60px;background:#ddd"><a href="/">Home</a></header>
    <div id="mock-bottom" style="position:fixed;bottom:0;left:0;width:100%;height:50px;background:#ddd"><a href="/">1</a><a href="/">2</a><a href="/">3</a><a href="/">4</a></div>
    <div style="height:45px"></div><main role="main" id="mock-feed"><article>Post</article></main>`;
  return `${base}
    <header id="mock-top" style="position:fixed;top:0;left:0;width:100%;height:60px;background:#ddd"><a href="/">Home</a></header>
    <nav id="mock-bottom" style="position:fixed;bottom:0;left:0;width:100%;height:50px;background:#ddd"><a href="/">1</a><a href="/">2</a><a href="/">3</a><a href="/">4</a></nav>
    <div style="height:60px"></div><div id="barcelona-page-layout" style="height:2200px"><div data-pagelet="feed">Post</div></div>`;
}

function nativeShortFixture() {
  return `<!doctype html><html data-theme="light" data-tux-color-scheme="light"><head><style>
    html,body{margin:0;overflow:hidden}html[data-theme="dark"][data-tux-color-scheme="dark"]{background:#000;color:#fff}#column-list-container{height:100vh;overflow-y:auto;scroll-snap-type:y mandatory}
    article{height:100%;scroll-snap-align:start;background:#eee}button{position:fixed;top:12px;left:12px}
    dialog button{position:static}#native-comments{left:auto;right:12px}#native-comments-feed{height:100px;overflow:auto}
  </style></head><body><main id="column-list-container" tabindex="0">${Array.from({length:8},(_,i)=>`<article>Native short ${i+1}</article>`).join('')}</main>
  ${nativeThemeControls()}
  <button id="native-next">Next video</button><button id="native-comments">Comments</button>
  <dialog><input aria-label="Native comment"><div id="native-comments-feed"><div style="height:1000px">Comments</div></div><button id="native-close-comments">Close</button></dialog><script>
    const feed=document.querySelector('main');
    document.querySelector('#native-next').onclick=()=>feed.scrollTo({top:feed.scrollTop+feed.clientHeight,behavior:'instant'});
    document.querySelector('#native-comments').onclick=()=>document.querySelector('dialog').showModal();
    document.querySelector('#native-close-comments').onclick=()=>document.querySelector('dialog').close();
    window.nativeMoves=0;window.preventedMoves=0;
    document.addEventListener('pointermove',event=>{window.nativeMoves++;if(event.defaultPrevented)window.preventedMoves++;});
  </script></body></html>`;
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
    'https://www.facebook.com/*', 'https://www.instagram.com/*', 'https://www.threads.com/*', 'https://*.tiktok.com/*'];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const launchBrowser = () => chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context = await launchBrowser();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  // CDP-fulfilled headers bypass DNR response modification. Real HTTP frames below test embedding rules.
  await context.route('https://www.tiktok.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:nativeShortFixture()}));
  await context.route(/^https:\/\/www\.(facebook|instagram|threads)\.com\//,route=>route.fulfill({
    status:200,contentType:'text/html',body:socialChromeFixture(new URL(route.request().url()).hostname)}));
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  const workspace = await context.newPage();
  workspace.on('pageerror', error => errors.push(error.message));
  await workspace.goto(`chrome-extension://${extensionId}/workspace.html`);
  await until(() => workspace.locator('.pane').count(), value => value === 3, 'three default panes');
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('workspace'))).workspace.panes.map(pane => pane.url),
    ['https://www.facebook.com/', 'https://www.threads.com/', 'https://www.instagram.com/']);
  assert.equal(manifest.action.default_popup,undefined);
  await until(()=>worker.evaluate(async()=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(tab=>tab.url===chrome.runtime.getURL('workspace.html'));
    return tab&&chrome.action.getPopup({tabId:tab.id});
  }),value=>value===`chrome-extension://${extensionId}/popup.html`,'workspace gets the control popup');
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#tool-theme').waitFor();
  assert.equal(await popup.locator('#open-workspace').isHidden(),true);
  assert.equal(await workspace.locator('.toolbar').count(),0);
  check('workspace action gets a control popup and workspace has no main toolbar');
  await workspace.screenshot({path:path.join(artifacts,'first-open.png')});
  await pick(workspace);await workspace.locator('.social-option[data-site="Facebook"]').click();
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','current unopened social selected');
  assert.equal(await workspace.locator('.pane-frame').count(),1);
  check('selecting current unopened social requests access and opens only that panel');

  const urls = [`${fixture.origin}/feed/a`, `${fixture.origin}/feed/b?nested=1`, `${fixture.origin}/feed/c?nested=1`];
  await worker.evaluate(urls => chrome.storage.local.set({ workspace: {
    panes: urls.map((url, index) => ({id:'fixture-' + index,url,enabled:true,weight:index+1})), sync:true,
  }, workspaceOverflow: [] }), urls);
  await workspace.reload(); await popup.reload();
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
  assert.equal(await workspace.locator('.pane-theme:disabled').count(),3,'unsupported local fixtures keep native presentation');
  check('connected workspace has 32px panel toolbars and no management control');
  assert.equal(await popup.locator('.description').innerText(),'Multitask is not real!');
  assert.equal((await popup.locator('body').innerText()).split('Multitask is not real!').length,2,'quote appears once');
  assert.equal(await popup.locator('.brand-quote,#sync-toggle,.sync-control').count(),0);
  assert.equal(await workspace.locator('.toolbar,#sync-toggle,#add-panel,#reload-all').count(),0);
  const rejectedControls = await worker.evaluate(async()=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(tab=>tab.url===chrome.runtime.getURL('workspace.html'));
    return chrome.tabs.sendMessage(tab.id,{type:'workspace-controls',action:'reload'},{frameId:0});
  });
  assert.equal(rejectedControls.ok,false);
  assert.equal(rejectedControls.error,'Invalid control source.');
  const capacityResponse=await popup.evaluate(async()=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(tab=>tab.url===chrome.runtime.getURL('workspace.html'));
    return chrome.tabs.sendMessage(tab.id,{type:'workspace-controls',action:'add',url:'https://www.facebook.com/'},{frameId:0});
  });
  assert.equal(capacityResponse.ok,false);
  assert.equal(await workspace.locator('.pane').count(),3);
  const focusPopup=await context.newPage();
  await focusPopup.goto(`chrome-extension://${extensionId}/popup.html`);
  await focusPopup.locator('#open-workspace').evaluate(button=>button.click());
  await until(()=>Promise.resolve(focusPopup.isClosed()),Boolean,'popup closes after workspace focus');
  assert.equal(context.pages().filter(page=>page.url()===workspace.url()).length,1);
  check('popup retains brand, enforces command source and capacity, and focuses the existing workspace');
  await workspace.evaluate(()=>document.fonts.ready);
  assert.equal(await popup.locator('.brand-mark').evaluate(node=>node.complete&&node.naturalWidth===32),true);
  const workspaceFontFamily=await popup.locator('.brand').evaluate(node=>getComputedStyle(node).fontFamily);
  assert.equal(workspaceFontFamily.split(',')[0].trim().replaceAll('"',''),'Ubuntu',workspaceFontFamily);
  await workspace.evaluate(async()=>{
    const probe=document.createElement('p');probe.id='font-probe';probe.textContent='Ti\u1ebfng Vi\u1ec7t: 3 ng\u00f3n tay \u2014 \u0110\u1ed3ng b\u1ed9 cu\u1ed9n \u1ef2 \u1ef3 \u1ef4 \u1ef5 \u1ef6 \u1ef7 \u1ef8 \u1ef9';
    probe.style.cssText='position:fixed;bottom:0;left:0;z-index:10;background:white;font:20px Ubuntu,system-ui';document.body.append(probe);
    // This probe introduces the regular face after the toolbar's font load.
    await document.fonts.load('20px Ubuntu', probe.textContent);
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
  const frameColorBeforeToolTheme=await frames[0].evaluate(()=>getComputedStyle(document.body).backgroundColor);
  const framePreferenceBeforeToolTheme=await frames[0].evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  await popup.locator('#tool-theme').click();
  await until(()=>workspace.locator('html').getAttribute('data-theme'),mode=>mode==='dark','tool dark theme reaches workspace');
  assert.equal(await popup.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await workspace.locator('.pane-toolbar').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(36, 36, 36)');
  assert.equal(await frames[0].evaluate(()=>getComputedStyle(document.body).backgroundColor),frameColorBeforeToolTheme);
  assert.equal(await frames[0].evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches),framePreferenceBeforeToolTheme,'tool theme does not change embedded site preference');
  await popup.screenshot({path:path.join(artifacts,'popup-dark.png')});
  await workspace.screenshot({path:path.join(artifacts,'workspace-dark.png')});
  await popup.reload();
  assert.equal(await popup.locator('html').getAttribute('data-theme'),'dark','tool theme persists on reopen');
  await popup.locator('#tool-theme').click();
  await until(()=>workspace.locator('html').getAttribute('data-theme'),mode=>mode==='light','tool light theme restored');
  assert.equal(await popup.locator('#github-link').getAttribute('href'),'https://github.com/tqdat410/3fingers');
  const githubPageEvent=context.waitForEvent('page');
  await context.route('https://github.com/tqdat410/3fingers',route=>route.fulfill({contentType:'text/html',body:'<title>Repository link fixture</title>'}));
  await popup.locator('#github-link').click();
  const githubPage=await githubPageEvent;await githubPage.waitForURL('https://github.com/tqdat410/3fingers');await githubPage.close();
  check('tool theme persists across popup reopen, updates panel bars without altering feeds, and GitHub opens the repository');
  assert.equal(await popup.locator('#github-link').getAttribute('href'),'https://github.com/tqdat410/3fingers');
  assert.equal(await popup.locator('#tool-theme').getAttribute('aria-label'),'Dark tool theme');
  assert.equal(await workspace.locator('#add-slot').count(),0);
  assert.equal(await popup.locator('#add-panel').isDisabled(),true);
  assert(Number(await popup.locator('#add-panel').evaluate(node=>getComputedStyle(node).opacity))<.5);
  const addPosition=await popup.locator('#add-panel').boundingBox(),syncPosition=await popup.locator('#github-link').boundingBox();
  assert(addPosition.x>=syncPosition.x+syncPosition.width);
  const handleBounds=await workspace.locator('.pane-drag-handle svg').first().boundingBox();
  const toolbarBounds=await workspace.locator('.pane-toolbar').first().boundingBox();
  assert(Math.abs(handleBounds.x+handleBounds.width/2-toolbarBounds.x-toolbarBounds.width/2)<=1);
  assert(Math.abs(handleBounds.y+handleBounds.height/2-toolbarBounds.y-toolbarBounds.height/2)<=1);
  await pick(workspace);
  const anchor=await workspace.locator('.pane-select').first().boundingBox(),dropdown=await workspace.locator('#site-picker').boundingBox();
  assert(Math.abs(dropdown.y-anchor.y-anchor.height-4)<2);
  assert(Math.abs(dropdown.x+dropdown.width-anchor.x-anchor.width)<2);
  assert.equal((await workspace.locator('#site-picker').innerText()).trim().replace(/\s+/g,' '),'Facebook Instagram Threads TikTok X Reddit YouTube Shorts');
  await workspace.keyboard.press('ArrowDown');
  assert.equal(await workspace.locator('.social-option[data-site="Instagram"]').evaluate(node=>document.activeElement===node),true);
  await workspace.keyboard.press('End');
  assert.equal(await workspace.locator('.social-option[data-site="YouTube Shorts"]').evaluate(node=>document.activeElement===node),true);
  await workspace.keyboard.press('Escape');
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false);
  assert.equal(await workspace.locator('.pane-select').first().evaluate(node=>document.activeElement===node),true);
  await pick(workspace);await workspace.locator('.pane-toolbar').first().click({position:{x:130,y:16}});
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false);
  await pick(workspace);await workspace.locator('.pane-select').first().click();
  assert.equal(await workspace.locator('#site-picker').evaluate(node=>node.matches(':popover-open')),false,'clicking the same trigger toggles the dropdown closed');
  check('centered drag icon, icon-only toolbar and anchored list-only dropdown support keyboard and outside dismissal');
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

  async function setAllPinned(pinned) {
    for (const button of await workspace.locator('.pane-drag-handle').all()) {
      if ((await button.getAttribute('aria-pressed') === 'true') !== pinned) await button.click();
    }
    await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes.every(pane=>pane.pinned===pinned),'all panel pins saved');
  }
  await setAllPinned(true);
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
  await setAllPinned(false);
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

  const beforeAppend = await state();
  await frames[0].evaluate(() => {
    // A feed can append its next page between wheel intent and momentum scroll.
    document.body.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 160 }));
    const article = document.createElement('article');
    article.textContent = 'Next page appended below the reading position';
    document.querySelector('#feed').append(article);
    window.scrollBy(0, 160);
  });
  await until(state, values => values[0].top > beforeAppend[0].top + 100
    && values[1].top > beforeAppend[1].top + 40 && values[2].top > beforeAppend[2].top + 40,
  'pagination append preserves ongoing wheel synchronization');
  check('loading the next page below the viewport preserves ongoing synchronized scrolling');

  const pin = workspace.locator('.pane-drag-handle').nth(1);
  await workspace.evaluate(()=>{
    window.pinDisabledTransitions=[];
    window.pinTransitionObserver=new MutationObserver(records=>{
      for(const record of records)if(record.oldValue===null&&record.target.closest('.pane-toolbar'))window.pinDisabledTransitions.push(record.target.className);
    });
    window.pinTransitionObserver.observe(document.querySelector('#panels'),{subtree:true,attributes:true,attributeFilter:['disabled'],attributeOldValue:true});
  });
  const pinOutline = await pin.locator('path').getAttribute('d');
  const pinBox = await pin.boundingBox();
  await workspace.mouse.move(pinBox.x+14,pinBox.y+14); await workspace.mouse.down();
  await workspace.mouse.move(pinBox.x+16,pinBox.y+16);
  assert.equal(await workspace.locator('.is-dragging').count(),0,'small click movement does not start reorder');
  await workspace.mouse.up();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[1].pinned===true,'pin saved');
  await workspace.locator('.pane-toolbar').nth(1).click({position:{x:130,y:16}});
  const pinTransitions=await workspace.evaluate(()=>{window.pinTransitionObserver.disconnect();return window.pinDisabledTransitions;});
  assert.deepEqual(pinTransitions,[],'pin and empty-toolbar clicks must not flash buttons through disabled styling');
  assert.equal(await pin.getAttribute('aria-pressed'),'true');
  assert((await pin.locator('path').getAttribute('d')).length<pinOutline.length,'solid pin removes inner cutout');
  async function wheelPanel(index) {
    const beforeWheel=await state();
    const bounds=await workspace.locator('.pane-frame').nth(index).boundingBox();
    await workspace.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height*.7);
    await workspace.mouse.wheel(0,160);
    await until(state,values=>values[index].top>beforeWheel[index].top+60,'panel wheel advances');
    await workspace.waitForTimeout(300);
  }
  const beforePinnedFollower=await state();
  await wheelPanel(0);
  const afterPinnedFollower=await state();
  assert.equal(afterPinnedFollower[1].top,beforePinnedFollower[1].top);
  assert(afterPinnedFollower[2].top>beforePinnedFollower[2].top+30,'remaining pair still syncs');
  await wheelPanel(1);
  const afterPinnedSource=await state();
  assert.equal(afterPinnedSource[0].top,afterPinnedFollower[0].top);
  assert.equal(afterPinnedSource[2].top,afterPinnedFollower[2].top);
  const retiredSync=await popup.evaluate(async()=>{
    const tabs=await chrome.tabs.query({});const tab=tabs.find(tab=>tab.url===chrome.runtime.getURL('workspace.html'));
    return chrome.tabs.sendMessage(tab.id,{type:'workspace-controls',action:'sync',sync:false},{frameId:0});
  });
  assert.equal(retiredSync.ok,false,'global sync command is removed');
  assert.equal(await pin.getAttribute('aria-pressed'),'true');
  const beforeRejoin=await state();
  await pin.press('Space');
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[1].pinned===false,'Space rejoins sync');
  await workspace.waitForTimeout(250);
  assert.deepEqual((await state()).map(value=>value.top),beforeRejoin.map(value=>value.top),'rejoin keeps reading positions');
  assert.equal(await pin.locator('path').getAttribute('d'),pinOutline);
  await wheelPanel(0);
  assert((await state())[1].top>beforeRejoin[1].top+30);
  check('pin excludes both directions, preserves the other pair and rejoins without a global switch or position jump');

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

  await setAllPinned(true);
  const paused = await state();
  await workspace.mouse.move(sourceBox.x + 40, sourceBox.y + sourceBox.height / 2);
  await workspace.mouse.wheel(0, 180);
  await until(state, values => values[0].top > paused[0].top + 100, 'paused source scroll');
  assert.equal((await state())[1].top, paused[1].top);
  check('pinning every panel pauses synchronized scrolling');


  await workspace.locator('.pane-frame').nth(2).evaluate(element => element.style.height = '100%');
  await setAllPinned(false);
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

  await workspace.locator('.pane-drag-handle').first().press('Enter');
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].pinned===true,'Enter pins before reorder');
  const orderRequests=fixture.requests.length,orderOffsets=(await state()).map(value=>value.top);
  for(const button of await workspace.locator('.pane').first().locator('.pane-toolbar button').all()){
    const bounds=await button.boundingBox();
    await workspace.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await workspace.mouse.down();
    await workspace.mouse.move(bounds.x+bounds.width/2+80,bounds.y+bounds.height/2,{steps:3});
    assert.equal(await workspace.locator('.is-dragging').count(),0,'toolbar buttons never begin reorder');
    await workspace.mouse.up();
  }
  assert.equal(await workspace.locator('.pane-drag-handle').first().getAttribute('aria-pressed'),'true','dragging from a pin does not toggle or reorder');
  assert.equal(fixture.requests.length,orderRequests);
  const orderHandle=workspace.locator('.pane-toolbar').first(),barBox=await orderHandle.boundingBox();
  const handleBox={...barBox,x:barBox.x+130,width:1};
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
  await until(()=>popup.locator('#reload-all').isDisabled(),Boolean,'popup reflects drag busy');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes[0].id,'fixture-0','preview must not save before drop');
  await workspace.screenshot({path:path.join(artifacts,'reorder-preview.png')});
  await workspace.mouse.up();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),
    data=>data.workspace.panes[0].id==='fixture-1','drop order saved');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes.find(pane=>pane.id==='fixture-0').pinned,true,'drag does not toggle pin');
  check('scaled panel follows pointer in both axes, previews before drop and keeps iframe viewport, documents and offsets');

  const cancelBar=await workspace.locator('.pane-toolbar').nth(1).boundingBox();
  const cancelHandle={...cancelBar,x:cancelBar.x+130,width:1};
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
  assert.equal(await popup.locator('#add-panel').isVisible(),true);
  assert.equal(await popup.locator('#add-panel').isDisabled(),true);
  const fourthPane=await workspace.evaluate(async()=>chrome.runtime.sendMessage({type:'configure',sync:true,
    panes:['a','b','c','d'].map(id=>({id,url:'https://example.com/',enabled:false}))}));
  assert.equal(fourthPane.ok,false);
  check('fourth pane is rejected in chooser UI and background contract');
  await workspace.screenshot({path:path.join(artifacts,'panel-controls.png')});
  await workspace.locator('.pane-drag-handle').first().press('ArrowRight');
  await workspace.reload(); await popup.reload();
  await until(()=>workspace.locator('.pane').evaluateAll(elements=>elements.map(element=>element.dataset.paneId)),
    ids=>ids.join(',')==='fixture-1,fixture-0,fixture-2','order persisted after reload');
  check('dragged order persists across reload');
  const retainedPin=workspace.locator('.pane[data-pane-id="fixture-0"] .pane-drag-handle');
  assert.equal(await retainedPin.getAttribute('aria-pressed'),'true','pin survives drop, cancelled drag, keyboard ordering and reload');
  await retainedPin.press('Enter');
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes.find(pane=>pane.id==='fixture-0').pinned===false,'unpin after reload');
  check('pin preference stays with its panel across drag, cancel, keyboard reorder and reload');

  urls[2]=fixture.origin+'/redirect';
  await worker.evaluate(urls=>chrome.storage.local.set({workspace:{panes:urls.map((url,index)=>({id:'fixture-'+index,url,enabled:true})),sync:true}}),urls);
  await workspace.reload(); await popup.reload();
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
      toolbarHeight:document.querySelector('.toolbar')?.getBoundingClientRect().height || 0,
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
  await workspace.reload(); await popup.reload();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'custom panels preserved');
  const restoredWorkspace=(await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  assert.deepEqual(restoredWorkspace.panes.map(pane=>pane.url),['https://x.com/home?lang=','https://example.org/']);
  assert.equal(Object.hasOwn(restoredWorkspace,'sync'),false);
  assert.equal(Object.hasOwn(restoredWorkspace,'reading'),false);
  assert.equal(Object.hasOwn(restoredWorkspace,'hideSiteChrome'),false);
  assert(restoredWorkspace.panes.every(pane=>!Object.hasOwn(pane,'weight')));
  check('legacy X URLs gain compatibility parameters and custom URLs survive while retired settings are removed');

  const archivedUrl=fixture.origin+'/feed/d';
  await worker.evaluate(archivedUrl=>chrome.storage.local.set({workspace:{panes:[
    {id:'old-a',url:'https://example.com/',enabled:false,weight:1},
    {id:'old-b',url:'https://example.org/',enabled:false,weight:2},
    {id:'old-c',url:'https://example.net/',enabled:false,weight:3},
    {id:'old-d',url:archivedUrl,enabled:false,weight:4}],sync:true},workspaceOverflow:[]}),archivedUrl);
  await workspace.reload(); await popup.reload();
  await until(()=>workspace.locator('.pane').count(),value=>value===3,'legacy three visible');
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('workspaceOverflow'))).workspaceOverflow.map(pane=>pane.url),[archivedUrl]);
  await workspace.locator('.pane-close').last().click();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'free archive slot');
  await until(()=>popup.locator('#add-panel').isEnabled(),Boolean,'popup archive slot');
  await popup.locator('#add-panel').click();
  await popup.locator('.archive-restore').click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get(['workspace','workspaceOverflow'])),
    value=>value.workspace.panes.some(pane=>pane.id==='old-d')&&value.workspaceOverflow.length===0,'archive restored atomically');
  // The initial storage write precedes configure/save. Let the UI finish that
  // transaction before the next scenario replaces storage from the worker.
  await until(()=>popup.locator('#add-sites').isHidden(),Boolean,'archive restore completed');
  check('surplus legacy URL is archived and restored into a free slot');

  const socialUrls=['https://www.facebook.com/','https://www.instagram.com/','https://www.threads.com/'];
  await worker.evaluate(socialUrls=>chrome.storage.local.set({workspace:{
    panes:socialUrls.map((url,index)=>({id:'social-'+index,url,enabled:true,weight:1})),sync:true,hideSiteChrome:true}}),socialUrls);
  await workspace.reload(); await popup.reload();
  await until(()=>workspace.locator('.pane').evaluateAll(panes=>panes.map(pane=>pane.dataset.status)),
    statuses=>statuses.length===3&&statuses.every(status=>status==='connected'),'social fixture connections');
  const socialFrames=socialUrls.map(url=>workspace.frames().find(frame=>frame.url()===url));
  const normalSocial=await context.newPage();await normalSocial.goto(socialUrls[1]);
  assert.equal((await normalSocial.evaluate(applySocialTheme,'dark')).supported,false,'theme helper refuses a normal tab');
  const themeHandles=await Promise.all((await workspace.locator('.pane-frame').all()).map(frame=>frame.elementHandle()));
  const themeOffsets=await Promise.all(socialFrames.map(frame=>frame.evaluate(()=>scrollY)));
  for(let index=0;index<socialFrames.length;index++){
    await socialFrames[index].evaluate(()=>localStorage.setItem('site-theme-preference','native'));
    const siblingsBefore=await Promise.all(socialFrames.map(frame=>frame.evaluate(()=>document.documentElement.className)));
    const button=workspace.locator('.pane-theme').nth(index);
    await until(()=>button.isEnabled(),Boolean,'native site theme control ready');
    const reloadBounds=await workspace.locator('.pane-reload').nth(index).boundingBox(),themeBounds=await button.boundingBox();
    assert(themeBounds.x>=reloadBounds.x+reloadBounds.width,'theme control is right of reload');
    await button.click();
    await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[index].theme==='site','theme ownership belongs to native app');
    await until(()=>socialFrames[index].evaluate(()=>getComputedStyle(document.body).backgroundColor),color=>color==='rgb(24, 24, 24)','native dark palette applied');
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.equal(await themeHandles[index].evaluate(node=>node.isConnected),true,'theme does not replace iframe');
    assert.equal(await socialFrames[index].evaluate(()=>scrollY),themeOffsets[index]);
    assert.equal(await socialFrames[index].evaluate(()=>localStorage.getItem('site-theme-preference')),'dark');
    assert.deepEqual(await socialFrames[index].evaluate(()=>window.nativeThemeCalls),['dark']);
    assert.equal(await socialFrames[index].evaluate(()=>window.unrelatedThemeClicks),0,'feed buttons with theme-like labels are never activated');
    assert.equal(await socialFrames[index].locator('#theme-media').evaluate(node=>getComputedStyle(node).filter),'none');
    for(let other=0;other<socialFrames.length;other++)if(other!==index)assert.equal(await socialFrames[other].evaluate(()=>document.documentElement.className),siblingsBefore[other]);
  }
  assert.equal(await normalSocial.locator('html').evaluate(node=>node.classList.contains('__fb-dark-mode')),false,'normal social tab is unchanged');
  await normalSocial.close();
  await workspace.locator('.pane-reload').first().click();
  await until(()=>themeHandles[0].evaluate(node=>node.isConnected),connected=>!connected,'dark social reload replaces its previous frame');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','dark social reload reconnects');
  socialFrames[0]=workspace.frames().find(frame=>frame.url()===socialUrls[0]);
  await until(()=>socialFrames[0].evaluate(()=>getComputedStyle(document.body).backgroundColor),color=>color==='rgb(24, 24, 24)','dark palette restored after reload');
  await socialFrames[0].evaluate(()=>window.nativeChooseTheme('light'));
  await until(()=>workspace.locator('.pane-theme').nth(0).getAttribute('aria-pressed'),value=>value==='false','manual native light choice updates toolbar');
  assert.equal(await socialFrames[0].evaluate(()=>document.documentElement.classList.contains('__fb-dark-mode')),false,'extension does not fight native choice');
  await socialFrames[0].evaluate(()=>window.nativeChooseTheme('dark'));
  await until(()=>workspace.locator('.pane-theme').nth(0).getAttribute('aria-pressed'),value=>value==='true','manual native dark choice updates toolbar');
  await popup.locator('#tool-theme').click();
  await until(()=>workspace.locator('html').getAttribute('data-theme'),mode=>mode==='dark','tool dark theme with native dark feeds');
  await popup.screenshot({path:path.join(artifacts,'popup-dark-socials.png')});
  await workspace.screenshot({path:path.join(artifacts,'socials-dark.png')});
  assert.equal(await socialFrames[0].evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(24, 24, 24)');
  for(const frame of socialFrames.slice(1))assert.equal(await frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(24, 24, 24)');
  await popup.locator('#tool-theme').click();
  await until(()=>workspace.locator('html').getAttribute('data-theme'),mode=>mode==='light','tool returns light independently');
  for(let index=0;index<socialFrames.length;index++){
    await workspace.locator('.pane-theme').nth(index).click();
    await until(()=>socialFrames[index].evaluate(()=>getComputedStyle(document.body).backgroundColor),color=>color==='rgb(255, 255, 255)','native light palette restored');
  }
  check('three native Meta handlers persist their settings and follow manual changes without menus, filters or scroll jumps');
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
  await workspace.locator('.pane-drag-handle').first().click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].pinned===true,'social panel pinned before reload and switch');
  const reloadedElement = await retainedHandles[0].elementHandle();
  const untouchedElements = await Promise.all(retainedHandles.slice(1).map(frame=>frame.elementHandle()));
  await workspace.locator('.pane-reload').first().click();
  await until(()=>reloadedElement.evaluate(node=>node.isConnected),connected=>!connected,'reload replaces target iframe');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','panel reload connected');
  assert.equal(await socialFrames[1].evaluate(()=>window.retainedDocument),'instagram');
  assert.equal(await socialFrames[2].evaluate(()=>window.retainedDocument),'threads');
  for (const element of untouchedElements) assert.equal(await element.evaluate(node=>node.isConnected),true);
  check('panel reload reconnects its feed without replacing other documents');
  assert.equal(await workspace.locator('.pane-drag-handle').first().getAttribute('aria-pressed'),'true','individual reload retains pin');

  const firstId=await workspace.locator('.pane').first().getAttribute('data-pane-id');
  await pick(workspace);
  assert.equal(await workspace.locator('.social-option').first().isEnabled(),true,'switch is available with three panels');
  await workspace.locator('.social-option[data-site="Instagram"]').click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].url===socialUrls[1],'social switch saved');
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','switched feed connected');
  assert.equal(await workspace.locator('.pane-drag-handle').first().getAttribute('aria-pressed'),'true','site replacement retains panel pin');
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

  const beforeReloadAll = (await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  const allOldFrames = await Promise.all((await workspace.locator('.pane-frame').all()).map(frame=>frame.elementHandle()));
  let releaseReload;
  const reloadGate = new Promise(resolve=>{ releaseReload=resolve; });
  const delayFacebook = async route=>{ await reloadGate; await route.fallback(); };
  await context.route('https://www.facebook.com/**',delayFacebook);
  try {
    await popup.getByRole('button',{name:'Reload all',exact:true}).click();
    await until(()=>workspace.locator('.pane').evaluateAll(panes=>panes.map(pane=>pane.dataset.status)),
      statuses=>statuses[0]!=='connected' && statuses.slice(1).every(status=>status==='connected'),
      'other socials reconnect while Facebook waits');
    for (const element of allOldFrames) assert.equal(await element.evaluate(node=>node.isConnected),false);
  } finally { releaseReload(); }
  await until(()=>workspace.locator('.pane').evaluateAll(panes=>panes.map(pane=>pane.dataset.status)),
    statuses=>statuses.every(status=>status==='connected'),'all reloaded feeds reconnect');
  await context.unroute('https://www.facebook.com/**',delayFacebook);
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace,beforeReloadAll);
  check('reload all starts feeds independently of a slow site and preserves layout and sync');

  await workspace.locator('.pane-close').last().click();
  await until(()=>workspace.locator('.pane').count(),value=>value===2,'chooser free slot');
  await until(()=>popup.locator('#add-panel').isEnabled(),Boolean,'popup add slot');
  await popup.locator('#add-panel').click();
  assert.deepEqual(await popup.locator('.social-option').evaluateAll(buttons=>buttons.map(button=>button.dataset.site)),['Facebook','Instagram','Threads','TikTok','X','Reddit','YouTube Shorts']);
  await popup.screenshot({path:path.join(artifacts,'popup-add.png')});
  await workspace.screenshot({path:path.join(artifacts,'social-chooser.png')});
  let controlsSnapshot=await popup.evaluate(() => {
    const clone=document.documentElement.cloneNode(true);
    for(const script of clone.querySelectorAll('script'))script.remove();
    for(const frame of clone.querySelectorAll('iframe'))frame.remove();
    for(const link of clone.querySelectorAll('link[rel="stylesheet"]'))link.remove();
    return clone.outerHTML;
  });
  let stylesheet=await readFile(path.join(project,'extension/workspace.css'),'utf8')+await readFile(path.join(project,'extension/popup.css'),'utf8');
  for(const [,asset] of stylesheet.matchAll(/url\("([^"]+)"\)/g)) {
    const bytes=await readFile(path.join(project,'extension',asset));
    stylesheet=stylesheet.replace(asset,'data:font/ttf;base64,'+bytes.toString('base64'));
  }
  controlsSnapshot=controlsSnapshot.replaceAll('assets/icons/icon-32.png','data:image/png;base64,'+(await readFile(path.join(project,'extension/assets/icons/icon-32.png'))).toString('base64'));
  await writeFile(path.join(artifacts,'render-controls.html'),'<!doctype html>'+controlsSnapshot.replace('</head>','<style>'+stylesheet+'</style></head>'));
  await popup.evaluate(() => {
    document.querySelector('.social-option[data-site="Facebook"]').click();
    document.querySelector('.social-option[data-site="Instagram"]').click();
  });
  await until(()=>workspace.locator('.pane').count(),count=>count===3,'popup addition creates third panel');
  await until(()=>workspace.locator('.pane').last().getAttribute('data-status'),value=>value==='connected','chosen duplicate social loads');
  const chosen=(await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace;
  assert.equal(chosen.panes.filter(pane=>pane.url===socialUrls[0]).length,2);
  assert.equal(chosen.panes.length,3);
  assert.equal(await workspace.locator('input[type="url"]').count(),0);
  check('social chooser supports duplicates with no URL entry and blocks simultaneous additions beyond three');
  assert.equal(await popup.locator('#add-sites').isHidden(),true);

  await worker.evaluate(urls=>chrome.storage.local.set({workspace:{panes:urls.slice(0,2).map((url,index)=>({
    id:'tiktok-peer-'+index,url,enabled:true,pinned:false,theme:'site'}))},workspaceOverflow:[]}),urls);
  await workspace.reload();await popup.reload();
  await until(()=>workspace.locator('.pane[data-status="connected"]').count(),count=>count===2,'TikTok peers ready');
  await until(()=>popup.locator('#add-panel').isEnabled(),Boolean,'TikTok add ready');
  await popup.locator('#add-panel').click();await popup.locator('.social-option[data-site="TikTok"]').click();
  const tiktokPane=workspace.locator('.pane[aria-label="TikTok"]');
  await until(()=>tiktokPane.getAttribute('data-status'),status=>status==='connected','TikTok connected');
  let tiktokFrame=workspace.frames().find(frame=>frame.url()==='https://www.tiktok.com/foryou');
  const tiktokId=await tiktokPane.getAttribute('data-pane-id');
  const tiktokPin=tiktokPane.locator('.pane-drag-handle');
  assert.equal(await tiktokPin.getAttribute('aria-pressed'),'true');
  assert.equal(await tiktokPin.getAttribute('aria-disabled'),'true');
  await until(()=>tiktokPane.locator('.pane-theme').isEnabled(),Boolean,'native TikTok theme ready');
  await tiktokPane.locator('.pane-theme').click();
  await until(()=>tiktokFrame.evaluate(()=>document.documentElement.dataset.theme),mode=>mode==='dark','native TikTok dark');
  await until(()=>tiktokPane.locator('.pane-theme').getAttribute('aria-label'),label=>label==='Light TikTok theme','native TikTok toolbar observes effect');
  assert.equal(await tiktokFrame.evaluate(()=>Object.hasOwn(document,'cookie')),false,'temporary theme cookie accessor is removed');
  assert.equal(await tiktokFrame.evaluate(()=>window.visibleNativeDrawerFrames),0,'native theme never opens More');
  assert.equal((await tiktokFrame.evaluate(applySocialTheme,'light')).applied,true);
  await tiktokPin.evaluate(button=>button.click());
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes[2].pinned,false,
    'TikTok policy leaves the user preference intact');
  const peers=urls.slice(0,2).map(url=>workspace.frames().find(frame=>frame.url()===url));
  const peerOffsets=()=>Promise.all(peers.map(frame=>frame.evaluate(()=>document.querySelector('[data-three-fingers-feed-scroller]').scrollTop)));
  const nativeOffset=()=>tiktokFrame.locator('main').evaluate(node=>node.scrollTop);
  const nativeBefore=await nativeOffset();
  const peerBounds=await workspace.locator('.pane-frame').first().boundingBox();
  await workspace.mouse.move(peerBounds.x+peerBounds.width/2,peerBounds.y+peerBounds.height/2);
  await workspace.mouse.wheel(0,250);
  await until(peerOffsets,positions=>positions.every(top=>top>150),'remaining feed pair still synchronizes');
  await workspace.waitForTimeout(250);
  assert.equal(await nativeOffset(),nativeBefore,'TikTok is not a follower');
  const peerBeforeNative=await peerOffsets();
  await tiktokFrame.locator('#native-next').click();
  await until(nativeOffset,top=>top>nativeBefore,'native next advances');
  await workspace.waitForTimeout(250);
  assert.deepEqual(await peerOffsets(),peerBeforeNative,'native advancement does not move peers');
  const beforeNativeKey=await nativeOffset();
  await tiktokFrame.locator('main').focus();await workspace.keyboard.press('PageDown');
  await until(nativeOffset,top=>top>beforeNativeKey+100,'native keyboard navigation remains enabled');
  await workspace.waitForTimeout(400);
  const nativeBounds=await tiktokPane.locator('.pane-frame').boundingBox();
  const nativeBeforeDrag=await nativeOffset();
  await tiktokFrame.locator('main').evaluate(node=>node.style.setProperty('scroll-snap-type','y mandatory','important'));
  await workspace.mouse.move(nativeBounds.x+nativeBounds.width/2,nativeBounds.y+nativeBounds.height*.8);
  await workspace.mouse.down();
  await workspace.mouse.move(nativeBounds.x+nativeBounds.width/2,nativeBounds.y+nativeBounds.height*.15,{steps:12});
  assert.equal(await tiktokFrame.locator('html').getAttribute('data-three-fingers-grabbing'),'');
  assert.equal(await tiktokFrame.locator('main').evaluate(node=>getComputedStyle(node).scrollSnapType),'none');
  await workspace.mouse.up();
  assert.equal(await tiktokFrame.locator('html').getAttribute('data-three-fingers-grabbing'),null);
  await until(nativeOffset,top=>top>nativeBeforeDrag+100,'TikTok local drag scrolls its feed');
  assert.deepEqual(await tiktokFrame.locator('main').evaluate(node=>({value:node.style.getPropertyValue('scroll-snap-type'),priority:node.style.getPropertyPriority('scroll-snap-type')})),
    {value:'y mandatory',priority:'important'},'native snap style and priority are restored after release');
  assert.deepEqual(await peerOffsets(),peerBeforeNative,'TikTok drag does not move peers');
  const afterNativeDrag=await nativeOffset();
  await workspace.mouse.wheel(0,400);
  await until(nativeOffset,top=>top>afterNativeDrag+100,'native wheel still advances');
  await workspace.waitForTimeout(400);
  assert.deepEqual(await peerOffsets(),peerBeforeNative,'TikTok wheel and keyboard do not move the other pair');
  await workspace.mouse.move(nativeBounds.x+nativeBounds.width/2,nativeBounds.y+nativeBounds.height*.7);
  await workspace.mouse.down();
  await workspace.mouse.move(nativeBounds.x+nativeBounds.width/2,nativeBounds.y+nativeBounds.height*.5,{steps:4});
  await tiktokFrame.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await workspace.mouse.up();
  assert.equal(await tiktokFrame.locator('html').getAttribute('data-three-fingers-grabbing'),null);
  assert.equal(await tiktokFrame.locator('main').evaluate(node=>getComputedStyle(node).scrollSnapType),'y mandatory','cancel restores native snapping');
  await tiktokFrame.locator('#native-comments').click();
  await tiktokFrame.getByRole('textbox',{name:'Native comment'}).fill('Native input');
  assert.equal(await tiktokFrame.getByRole('textbox',{name:'Native comment'}).inputValue(),'Native input');
  await tiktokFrame.locator('#native-comments-feed').evaluate(node=>node.scrollTop=200);
  assert.equal(await tiktokFrame.locator('#native-comments-feed').evaluate(node=>node.scrollTop),200);
  assert.deepEqual(await peerOffsets(),peerBeforeNative,'native comments stay independent');
  await tiktokFrame.locator('#native-close-comments').click();
  assert((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).every(script=>script.matches.every(match=>!match.includes('tiktok.com'))));
  check('TikTok local drag, native next, wheel, keyboard and comment controls stay independent without custom prefetch');

  const routerBefore=await peerOffsets();
  const routerProbe=await worker.evaluate(async tiktokId=>{
    const {sessions}=await chrome.storage.session.get('sessions');
    const [tabId,session]=Object.entries(sessions)[0];
    const tiktok=session.panes.find(pane=>pane.id===tiktokId);
    const peer=session.panes.find(pane=>pane.id==='tiktok-peer-0');
    const openPort=async documentId=>{
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[documentId]},func:async()=>{
        const [,paneId,session]=/^3fingers:([^:]+):(.+)$/.exec(window.name);
        const port=chrome.runtime.connect({name:'3fingers-feed'});
        const probe=globalThis.__routingProbe={port,messages:[]};
        return new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('Routing probe handshake timeout')),2000);
          port.onMessage.addListener(message=>{
            if(message.type==='ready'){clearTimeout(timeout);resolve({nativeScrolling:message.nativeScrolling});}
            if(message.type==='apply')probe.messages.push(message.delta);
          });
          port.postMessage({type:'hello',paneId,session});
        });
      }});return result;
    };
    const nativeReady=await openPort(tiktok.documentId);
    await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[tiktok.documentId]},func:()=>{
      const session=window.name.split(':')[2];
      globalThis.__routingProbe.port.postMessage({type:'scroll',session,sequence:1,delta:.5});
    }});
    await new Promise(resolve=>setTimeout(resolve,100));
    const afterForged=(await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[peer.documentId]},
      func:()=>document.querySelector('[data-three-fingers-feed-scroller]').scrollTop}))[0].result;
    await openPort(peer.documentId);
    await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[peer.documentId]},func:()=>{
      const session=window.name.split(':')[2];
      globalThis.__routingProbe.port.postMessage({type:'scroll',session,sequence:1,delta:.25});
    }});
    await new Promise(resolve=>setTimeout(resolve,100));
    const received=(await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[tiktok.documentId]},
      func:()=>globalThis.__routingProbe.messages}))[0].result;
    for(const documentId of [tiktok.documentId,peer.documentId])await chrome.scripting.executeScript({target:{tabId:Number(tabId),documentIds:[documentId]},
      func:()=>{globalThis.__routingProbe.port.disconnect();delete globalThis.__routingProbe;}});
    return {nativeReady,afterForged,received};
  },tiktokId);
  assert.equal(routerProbe.nativeReady.nativeScrolling,true);
  assert.equal(routerProbe.afterForged,routerBefore[0],'router rejects raw TikTok source messages even when unpinned');
  assert.deepEqual(routerProbe.received,[],'router sends no apply messages to TikTok');
  await until(()=>workspace.locator('.pane[data-status="connected"]').count(),count=>count===3,'content connections restored after routing probe');
  check('background enforces TikTok exclusion in both directions independently of content handlers and stored pin');

  await tiktokPin.focus();await workspace.keyboard.press('ArrowLeft');
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[1].id===tiktokId,'independent panel keyboard reorder');
  await workspace.reload();await popup.reload();
  await until(()=>workspace.locator('.pane[data-status="connected"]').count(),count=>count===3,'TikTok workspace restores');
  assert.equal(await tiktokPane.locator('.pane-drag-handle').getAttribute('aria-pressed'),'true');
  const beforeTikTokReload=await tiktokPane.locator('.pane-frame').elementHandle();
  await tiktokPane.locator('.pane-reload').click();
  await until(()=>beforeTikTokReload.evaluate(node=>node.isConnected),connected=>!connected,'TikTok reload replaces its document');
  await until(()=>tiktokPane.getAttribute('data-status'),status=>status==='connected','TikTok reload reconnects');
  await tiktokPane.locator('.pane-select').click();await workspace.locator('.social-option[data-site="Instagram"]').click();
  const replacedPane=workspace.locator(`.pane[data-pane-id="${tiktokId}"]`);
  await until(()=>replacedPane.getAttribute('data-status'),status=>status==='connected','TikTok replaced with normal feed');
  assert.equal(await replacedPane.locator('.pane-drag-handle').getAttribute('aria-pressed'),'false','normal feed regains its unpinned preference');
  assert.equal(await replacedPane.locator('.pane-drag-handle').getAttribute('aria-disabled'),'false');
  await until(()=>replacedPane.locator('.pane-theme').isEnabled(),Boolean,'replacement native Meta theme becomes available');
  let releaseTikTok;
  const tiktokGate=new Promise(resolve=>{releaseTikTok=resolve;});
  const delayedTikTok=async route=>{await tiktokGate;await route.fallback();};
  await context.route('https://www.tiktok.com/**',delayedTikTok);
  try {
    await replacedPane.locator('.pane-select').click();await workspace.locator('.social-option[data-site="TikTok"]').click();
    await until(()=>tiktokPane.locator('.pane-reload').isEnabled(),Boolean,'replacement operation finished before TikTok response');
    assert.equal(await tiktokPane.locator('.pane-theme').isDisabled(),true,'old Meta theme capability is cleared while TikTok loads');
  } finally {releaseTikTok();await context.unroute('https://www.tiktok.com/**',delayedTikTok);}
  await until(()=>tiktokPane.getAttribute('data-status'),status=>status==='connected','TikTok selected in replace picker');
  await until(()=>tiktokPane.locator('.pane-theme').isEnabled(),Boolean,'native TikTok theme returns after replacement');
  assert.equal(await tiktokPane.locator('.pane-drag-handle').getAttribute('aria-disabled'),'true');
  check('TikTok independence survives keyboard reorder, workspace reload, panel reload and switching sites without changing user pin preferences');

  while(await workspace.locator('.pane').count()) await workspace.locator('.pane-close').first().click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes.length===0,'empty layout saved');
  assert.equal(await popup.locator('#add-panel').isVisible(),true);
  await workspace.reload(); await popup.reload();
  assert.equal(await workspace.locator('.pane').count(),0);
  await until(()=>popup.locator('#add-panel').isEnabled(),Boolean,'empty popup ready');
  await popup.locator('#add-panel').click();await popup.locator('.social-option[data-site="Threads"]').click();
  await until(()=>workspace.locator('.pane').first().getAttribute('data-status'),value=>value==='connected','add from empty layout');
  assert.equal(await workspace.locator('.pane-drag-handle').first().isEnabled(),true);
  await workspace.locator('.pane-drag-handle').first().click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].pinned===true,'single panel can pin');
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
  await popup.reload();
  assert.equal(await popup.locator('#popup-status').innerText(),'');
  assert.equal(await popup.locator('#open-workspace').isHidden(),true);
  assert.equal(await popup.locator('#sync-toggle').count(),0);
  assert.equal(await popup.locator('#reload-all').isDisabled(),true);
  assert.equal(await popup.locator('#add-panel').isDisabled(),true);
  await popup.screenshot({path:path.join(artifacts,'popup-empty.png')});
  const newWorkspaceEvent=context.waitForEvent('page');
  await popup.locator('#open-workspace').evaluate(button=>button.click());
  const createdWorkspace=await newWorkspaceEvent;
  await createdWorkspace.waitForURL(`chrome-extension://${extensionId}/workspace.html`);
  await until(()=>createdWorkspace.locator('.pane').count(),value=>value>0,'workspace created from popup');
  await createdWorkspace.close();
  check('popup handles a closed workspace and can create a new one');
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
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ timestamp:new Date().toISOString(), checks, errors, environment:'Playwright Chromium, temporary headless profile; localhost and four intercepted social origins pre-granted only in test copy; no authenticated social test' }, null, 2)).catch(() => {});
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
