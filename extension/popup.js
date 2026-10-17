import { socialSites, parseSite } from './shared/core.js';

const workspaceUrl = chrome.runtime.getURL('workspace.html');
import { toggleToolTheme } from './shared/ui-theme.js';
const add = document.querySelector('#add-panel');
const reload = document.querySelector('#reload-all');
const picker = document.querySelector('#add-sites');
const status = document.querySelector('#popup-status');
let workspaceTab, snapshot, busy = false;

async function findWorkspace() {
  const tabs = await chrome.tabs.query({});
  const { id: windowId } = await chrome.windows.getCurrent();
  const workspaces = tabs.filter(tab => tab.url === workspaceUrl);
  return workspaces.find(tab => tab.active && tab.windowId === windowId)
    || workspaces.find(tab => tab.windowId === windowId) || workspaces[0];
}
async function command(action = 'get', detail = {}) {
  if (!workspaceTab) throw new Error('Open workspace first.');
  const response = await chrome.tabs.sendMessage(workspaceTab.id, { type: 'workspace-controls', action, ...detail }, { frameId: 0 });
  if (!response?.ok) throw new Error(response?.error || 'Workspace unavailable.');
  snapshot = response;
  render();
}
function render() {
  const disabled = busy || !snapshot || snapshot.busy;
  reload.disabled = disabled || !snapshot?.enabled;
  add.disabled = disabled || snapshot.count >= 3;
  for (const button of document.querySelectorAll('.social-option,.archive-restore')) button.disabled = add.disabled;
  if (add.disabled) { picker.hidden = true; add.setAttribute('aria-expanded', 'false'); }
  const archive = document.querySelector('#archive-list');
  archive.replaceChildren();
  document.querySelector('#archive-section').hidden = !snapshot?.archive?.length;
  for (const pane of snapshot?.archive || []) {
    const button = document.createElement('button');
    button.className = 'archive-restore'; button.textContent = `Restore ${parseSite(pane.url).host}`;
    button.disabled = add.disabled;
    button.addEventListener('click', () => addSite(pane.url, pane.id));
    archive.append(button);
  }
}
async function run(action, detail) {
  if (busy) return;
  busy = true; render(); status.textContent = '';
  try { await command(action, detail); }
  catch (error) { status.textContent = error.message; }
  finally { busy = false; render(); }
}
async function addSite(url, archiveId) {
  if (busy || add.disabled) return;
  // Request from the actual popup click so Chrome retains the user gesture.
  const permission = chrome.permissions.request({ origins: [parseSite(url).pattern] });
  busy = true; render(); status.textContent = '';
  try {
    if (!await permission) throw new Error('Site access denied.');
    await command('add', { url, archiveId });
    picker.hidden = true; add.setAttribute('aria-expanded', 'false'); add.focus();
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; render(); }
}
for (const site of socialSites) {
  const button = document.createElement('button');
  button.className = 'social-option'; button.type = 'button'; button.dataset.site = site.name;
  button.textContent = site.name;
  button.addEventListener('click', () => addSite(site.url));
  document.querySelector('#social-chooser').append(button);
}
add.addEventListener('click', () => {
  picker.hidden = !picker.hidden; add.setAttribute('aria-expanded', String(!picker.hidden));
  if (!picker.hidden) picker.querySelector('button:not(:disabled)')?.focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !picker.hidden) {
    event.preventDefault(); picker.hidden = true; add.setAttribute('aria-expanded', 'false'); add.focus();
  }
});
document.querySelector('#tool-theme').addEventListener('click', () => {
  toggleToolTheme().catch(error => { status.textContent = error.message; });
});
reload.addEventListener('click', () => run('reload'));
document.querySelector('#open-workspace').addEventListener('click', async () => {
  try {
    const tab = await findWorkspace();
    if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
    else await chrome.tabs.create({ url: workspaceUrl });
    window.close();
  } catch (error) { status.textContent = error.message; }
});
async function refresh() {
  if (busy) return;
  try {
    workspaceTab = await findWorkspace();
    if (!workspaceTab) { snapshot = null; status.textContent = 'Open workspace to get started.'; render(); return; }
    await command(); status.textContent = '';
  } catch { snapshot = null; render(); status.textContent = 'Workspace is loading. Reopen this menu.'; }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.workspace || changes.workspaceOverflow)) void refresh();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'workspace-controls-changed' && sender.url === workspaceUrl && sender.tab?.id === workspaceTab?.id) void refresh();
});
chrome.tabs.onRemoved.addListener(tabId => { if (tabId === workspaceTab?.id) void refresh(); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId === workspaceTab?.id && (change.url || change.status === 'complete')) void refresh();
});
render();
void refresh();
