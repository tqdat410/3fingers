import assert from 'node:assert/strict';
import { cp, appendFile, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), '3fingers-action-'));
let context;
async function until(read, predicate, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(label);
}
try {
  const extension = path.join(temporary, 'extension');
  await cp(path.join(project, 'extension'), extension, { recursive: true });
  // Exercise the registered implementation in its worker without a toolbar automation API.
  await appendFile(path.join(extension, 'background.js'), '\nglobalThis.__actionClickForTest = handleActionClick;\n');
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const state = await worker.evaluate(async () => {
    await chrome.storage.local.set({ workspace: { panes: [] }, workspaceOverflow: [] });
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    return { tabId: tab.id, windowId: tab.windowId, url: chrome.runtime.getURL('myfeeds.html') };
  });
  const click = tabId => worker.evaluate(tabId => globalThis.__actionClickForTest({ id: tabId }), tabId);
  const tabs = () => worker.evaluate(() => chrome.tabs.query({}));
  const popupFor = tabId => worker.evaluate(tabId => chrome.action.getPopup({ tabId }), tabId);
  assert.equal(await popupFor(state.tabId), '');
  await Promise.all([click(state.tabId), click(state.tabId)]);
  await click(state.tabId);
  let workspaces = await until(async () => (await tabs()).filter(tab => tab.url === state.url), value => value.length === 1, 'workspace commits');
  assert.equal(workspaces.length, 1, 'rapid clicks create only one workspace');
  const workspace = workspaces[0];
  assert.equal(workspace.active, true);
  await until(() => popupFor(workspace.id), value => value.endsWith('/popup.html'), 'workspace action popup');
  console.log('PASS outside action opens one workspace directly and enables its per-tab control popup without new permissions');

  const page = await until(() => Promise.resolve(context.pages().find(page => page.url() === state.url)), Boolean, 'workspace page');
  await page.evaluate(() => { window.actionDocumentMarker = 'retained'; });
  await worker.evaluate(id => chrome.tabs.update(id, { active: true }), state.tabId);
  await click(state.tabId);
  assert.equal((await tabs()).filter(tab => tab.url === state.url).length, 1);
  assert.equal((await tabs()).find(tab => tab.id === workspace.id).active, true);
  assert.equal(await page.evaluate(() => window.actionDocumentMarker), 'retained', 'existing feeds are not reloaded');
  await click(workspace.id);
  const popups = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }));
  assert.equal(popups.length, 1, 'Chrome opens a real native action popup');
  assert(popups[0].documentUrl.endsWith('/popup.html'));
  console.log('PASS existing workspace is focused without reload and its action opens the real native dropdown');

  const secondWindow = await worker.evaluate(() => chrome.windows.create({ url: 'about:blank', focused: true }));
  await click(secondWindow.tabs[0].id);
  assert.equal((await tabs()).filter(tab => tab.url === state.url).length, 1);
  assert.equal(await worker.evaluate(id => chrome.windows.get(id).then(window => window.focused), workspace.windowId), true);
  assert.equal(await page.evaluate(() => window.actionDocumentMarker), 'retained');
  await worker.evaluate(id => chrome.tabs.update(id, { url: 'about:blank' }), workspace.id);
  await until(() => popupFor(workspace.id), value => value === '', 'navigation clears popup');
  await click(workspace.id);
  workspaces = await until(async () => (await tabs()).filter(tab => tab.url === state.url), value => value.length === 1, 'replacement workspace commits');
  assert.equal(workspaces.length, 1);
  assert.notEqual(workspaces[0].id, workspace.id);
  console.log('PASS cross-window activation focuses the existing window and navigation away restores direct-open behavior');
  const legacyUrl=state.url.replace('myfeeds.html','workspace.html');
  const legacyPage=await context.newPage();
  await legacyPage.goto(legacyUrl);
  await legacyPage.waitForURL(state.url);
  assert.equal(await legacyPage.locator('#panels').count(),1);
  await legacyPage.close();
  const legacyFile=path.join(extension,'workspace.html');
  const redirect=await readFile(legacyFile,'utf8');
  try {
    // Simulate a still-open legacy tab before its redirect has run.
    await writeFile(legacyFile,'<!doctype html><title>Legacy workspace</title>');
    const stalled=await context.newPage();await stalled.goto(legacyUrl);
    const legacyTab=(await tabs()).find(tab=>tab.url===legacyUrl);
    const count=(await tabs()).length;
    await click(legacyTab.id);
    await stalled.waitForURL(state.url);
    assert.equal((await tabs()).length,count,'action reuses the legacy tab rather than creating another');
    assert.equal((await tabs()).find(tab=>tab.id===legacyTab.id).url,state.url);
    await stalled.close();
  } finally { await writeFile(legacyFile,redirect); }
  console.log('PASS myfeeds is canonical; old workspace links redirect and a stalled legacy tab is migrated in place');
} finally {
  await context?.close();
  if (path.dirname(temporary) === path.resolve(tmpdir()) && path.basename(temporary).startsWith('3fingers-action-')) {
    await rm(temporary, { recursive: true, force: true });
  }
}
