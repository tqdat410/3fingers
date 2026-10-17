import { parseSite, socialSites, normalizeWorkspace } from './shared/core.js';

import './shared/ui-theme.js';

const panels = document.querySelector('#panels');
const picker = document.querySelector('#site-picker');
const workspaceStatus = document.querySelector('#workspace-status');
const chooser = document.querySelector('#social-chooser');
const views = new Map();
const maxPanes = 3;
let state, overflowPanes = [], session, configureQueue = Promise.resolve(), reorder = null, layoutBusy = false, pickerPaneId = null, pickerTrigger;
const siteName = pane => socialSites.find(site => new URL(site.url).hostname === new URL(pane.url).hostname)?.name
  || new URL(pane.url).hostname.replace(/^www\./, '');
const announce = text => { document.querySelector('#order-status').textContent = text; };
const save = () => chrome.storage.local.set({ workspace: state, workspaceOverflow: overflowPanes });

const pickerOpen = () => picker.matches(':popover-open');
let pressedPickerTrigger = null;
// Record the press before native light-dismiss hides the popover on pointerup.
document.addEventListener('pointerdown', event => {
  const pressedButton = event.target.closest('button');
  pressedPickerTrigger = pickerOpen() && pressedButton === pickerTrigger ? pickerTrigger : null;
}, true);
function closePicker() {
  if (pickerOpen()) picker.hidePopover();
  if (pickerTrigger?.isConnected) pickerTrigger.focus();
}
function positionPicker() {
  if (!pickerTrigger?.isConnected || !pickerOpen()) return;
  const rect = pickerTrigger.getBoundingClientRect(), gap = 4, edge = 8;
  const left = Math.max(edge, Math.min(innerWidth - picker.offsetWidth - edge, rect.right - picker.offsetWidth));
  const top = rect.bottom + gap + picker.offsetHeight <= innerHeight - edge
    ? rect.bottom + gap : Math.max(edge, rect.top - picker.offsetHeight - gap);
  picker.style.left = left + 'px'; picker.style.top = top + 'px';
}
function openPicker(id, trigger) {
  if (layoutBusy) return;
  const closingCurrentPicker = pressedPickerTrigger === trigger || (pickerOpen() && pickerTrigger === trigger);
  pressedPickerTrigger = null;
  if (closingCurrentPicker) { closePicker(); return; }
  if (pickerOpen()) picker.hidePopover();
  pickerPaneId = id; pickerTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  renderControls();
  picker.showPopover(); positionPicker();
  chooser.querySelector('button:not(:disabled)')?.focus();
}
picker.addEventListener('toggle', event => {
  if (event.newState === 'closed') {
    pickerTrigger?.setAttribute('aria-expanded', 'false');
    if (picker.contains(document.activeElement) && pickerTrigger?.isConnected) pickerTrigger.focus();
  }
});
window.addEventListener('resize', positionPicker);
document.addEventListener('scroll', positionPicker, true);
picker.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const options = [...picker.querySelectorAll('button:not(:disabled)')];
  if (!options.length) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement);
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[target].focus();
});

function status(id, value, text) {
  const view = views.get(id);
  if (!view) return;
  view.element.dataset.status = value;
  view.element.querySelector('.pane-status-text').textContent = text;
  if (value !== 'connected') {
    if (reorder) void finishReorder(false);
    view.documentId = null;
  }
  renderControls();
}
function configure() {
  const operation = configureQueue.then(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'configure', panes: state.panes });
    if (!response?.ok) throw new Error(response?.error || 'Extension unavailable.');
    session = response.session;
    for (const pane of state.panes) {
      const result = response.panes.find(item => item.id === pane.id);
      const view = views.get(pane.id);
      if (result?.documentId) view.documentId = result.documentId;
      if (pane.enabled && !result?.enabled) {
        pane.enabled = false; removeFrame(pane.id);
        status(pane.id, 'permission', 'Allow site access to continue.');
      }
    }
    await save();
  });
  configureQueue = operation.catch(error => { workspaceStatus.textContent = error.message; });
  return operation;
}
function removeFrame(id) {
  const view = views.get(id);
  if (!view) return;
  if (reorder) void finishReorder(false); clearTimeout(view.timer); view.documentId = null;
  view.frame?.remove(); view.frame = null;
  view.element.querySelector('.pane-placeholder').hidden = false;
}
function mountFrame(pane) {
  const view = views.get(pane.id);
  removeFrame(pane.id);
  view.element.querySelector('.pane-placeholder').hidden = true;
  const frame = document.createElement('iframe');
  frame.className = 'pane-frame'; frame.title = siteName(pane);
  frame.name = `3fingers:${pane.id}:${session}`;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.addEventListener('load', () => { if (reorder) void finishReorder(false); if (!view.documentId) status(pane.id, 'loading', 'Connecting...'); });
  view.frame = frame;
  status(pane.id, 'loading', 'Loading...');
  frame.src = pane.url;
  view.element.querySelector('.pane-content').prepend(frame);
  view.timer = setTimeout(() => {
    if (view.element.dataset.status !== 'connected') status(pane.id, 'error', 'Unable to connect. Sign in or try again.');
  }, 12000);
}
async function openPane(pane, button) {
  if (layoutBusy || !pane) return;
  const permission = chrome.permissions.request({ origins: [parseSite(pane.url).pattern] });
  layoutBusy = true; renderControls();
  button.disabled = true;
  try {
    if (!await permission) { status(pane.id, 'permission', 'Site access denied.'); return; }
    if (!views.has(pane.id)) return;
    pane.enabled = true;
    await configure();
    if (pane.enabled) mountFrame(pane);
  } catch (error) { status(pane.id, 'error', error.message); }
  finally { layoutBusy = false; renderControls(); button.disabled = false; }
}
async function reloadAll() {
  if (layoutBusy || !state.panes.some(pane => pane.enabled)) return;
  closePicker();
  layoutBusy = true; renderControls();
  try {
    await configure();
    // Start every permitted panel together without waiting for another to load.
    for (const pane of state.panes.filter(pane => pane.enabled)) mountFrame(pane);
  } catch (error) { workspaceStatus.textContent = error.message; }
  finally { layoutBusy = false; renderControls(); }
}
function addView(pane) {
  const element = document.querySelector('#pane-template').content.firstElementChild.cloneNode(true);
  element.dataset.paneId = pane.id;
  element.setAttribute('aria-label', siteName(pane));
  element.querySelector('.pane-placeholder h2').textContent = siteName(pane);
  const handle = element.querySelector('.pane-drag-handle');
  handle.title = 'Move panel';
  handle.setAttribute('aria-label', 'Move ' + siteName(pane) + '. Drag or use arrow keys.');
  const view = { id: pane.id, element, frame: null, timer: null, documentId: null, handle,
    themeSupported: false, siteTheme: 'light', pinOutline: handle.querySelector('path').getAttribute('d') };
  handle.addEventListener('pointerdown', event => startReorder(pane.id, event));
  handle.addEventListener('click', event => { if (event.detail === 0) void togglePin(pane.id); });
  handle.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const index = state.panes.findIndex(item => item.id === pane.id);
      void movePane(pane.id, index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  views.set(pane.id, view);
  for (const selector of ['.pane-open', '.pane-retry']) {
    const button = element.querySelector(selector);
    button.addEventListener('click', () => openPane(state.panes.find(item => item.id === pane.id), button));
  }
  element.querySelector('.pane-select').addEventListener('click', event => {
    event.currentTarget.setAttribute('aria-expanded', 'true'); openPicker(pane.id, event.currentTarget);
  });
  element.querySelector('.pane-theme').addEventListener('click', () => void toggleSiteTheme(pane.id));
  element.querySelector('.pane-close').addEventListener('click', () => void removePane(pane.id));
  element.querySelector('.pane-reload').addEventListener('click', event => {
    if (!layoutBusy) void openPane(state.panes.find(item => item.id === pane.id), event.currentTarget);
  });
  panels.append(element);
  status(pane.id, 'idle', '');
}
function startReorder(id, event) {
  if (layoutBusy || event.button !== 0) return;
  event.preventDefault();
  const view = views.get(id);
  view.handle.focus();
  layoutBusy = true;
  reorder = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
    originLeft: panels.getBoundingClientRect().left + view.element.offsetLeft - panels.scrollLeft,
    width: view.element.offsetWidth, original: [...state.panes], element: view.element };
  panels.setPointerCapture(event.pointerId);
  renderControls();
}
function cancelPaneAnimations() {
  for (const view of views.values()) {
    for (const animation of view.element.getAnimations()) animation.cancel();
  }
}
panels.addEventListener('pointermove', event => {
  if (event.pointerId !== reorder?.pointerId) return;
  event.preventDefault();
  const drag = reorder, dx = event.clientX - drag.startX;
  if (!drag.moved && Math.hypot(dx, event.clientY - drag.startY) < 6) return;
  drag.moved = true;
  if (state.panes.length < 2 || !panels.moveBefore) return;
  document.body.classList.add('reordering');
  drag.element.classList.add('is-dragging');
  const width = drag.width, container = panels.getBoundingClientRect();
  const index = state.panes.findIndex(pane => pane.id === drag.id);
  const target = Math.max(0, Math.min(state.panes.length - 1, Math.floor((drag.originLeft + dx + width / 2 - container.left + panels.scrollLeft) / width)));
  if (target !== index) {
    cancelPaneAnimations();
    const positions = new Map([...views.values()].map(view => [view.id, view.element.getBoundingClientRect().left]));
    const next = [...state.panes], [pane] = next.splice(index, 1); next.splice(target, 0, pane);
    setPaneOrder(next);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) for (const view of views.values()) {
      if (view.id === drag.id) continue;
      const shift = positions.get(view.id) - view.element.getBoundingClientRect().left;
      if (shift) view.element.animate([{ transform: 'translateX(' + shift + 'px)' }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
    }
    announce(siteName(pane) + ' at position ' + (target + 1) + '. Drop to save. Escape to cancel.');
  }
  const base = container.left + drag.element.offsetLeft - panels.scrollLeft;
  const x = drag.originLeft + dx - base, y = event.clientY - drag.startY;
  drag.element.style.transform = 'translate(' + x + 'px,' + y + 'px)';
});
async function finishReorder(commit) {
  if (!reorder) return;
  const drag = reorder; reorder = null;
  drag.element.style.removeProperty('transform'); drag.element.classList.remove('is-dragging');
  document.body.classList.remove('reordering');
  cancelPaneAnimations();
  if (panels.hasPointerCapture(drag.pointerId)) panels.releasePointerCapture(drag.pointerId);
  if (!commit) { if (drag.moved && panels.moveBefore) setPaneOrder(drag.original); }
  else if (drag.moved) try { await save(); } catch (error) {
    setPaneOrder(drag.original); workspaceStatus.textContent = error.message;
  }
  layoutBusy = false; renderControls(); views.get(drag.id)?.handle.focus();
  if (commit && !drag.moved) await togglePin(drag.id);
}
async function togglePin(id) {
  if (layoutBusy) return;
  const pane = state.panes.find(pane => pane.id === id);
  if (!pane) return;
  const previous = pane.pinned === true;
  pane.pinned = !previous; layoutBusy = true; renderControls();
  try { await configure(); }
  catch (error) {
    pane.pinned = previous;
    await configure().catch(() => {});
    workspaceStatus.textContent = error.message;
  } finally { layoutBusy = false; renderControls(); }
}
async function toggleSiteTheme(id) {
  if (layoutBusy) return;
  const pane = state.panes.find(pane => pane.id === id), view = views.get(id);
  if (!pane?.enabled || !view?.themeSupported) return;
  const previous = pane.theme || 'site';
  const current = previous === 'site' ? view.siteTheme : previous;
  pane.theme = current === 'dark' ? 'light' : 'dark';
  layoutBusy = true; renderControls();
  try { await configure(); }
  catch (error) {
    pane.theme = previous;
    await configure().catch(() => {});
    workspaceStatus.textContent = error.message;
  } finally { layoutBusy = false; renderControls(); }
}
panels.addEventListener('pointerup', event => { if (event.pointerId === reorder?.pointerId) void finishReorder(true); });
for (const type of ['pointercancel', 'lostpointercapture']) panels.addEventListener(type, event => {
  if (event.pointerId === reorder?.pointerId) void finishReorder(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reorder) { event.preventDefault(); void finishReorder(false); }
}, true);
function renderControls() {
  chrome.runtime.sendMessage({ type: 'workspace-controls-changed' }).catch(() => {});
  document.querySelector('#empty-workspace').hidden = state.panes.length > 0;
  for (const pane of state.panes) {
    const view = views.get(pane.id); if (!view) continue;
    const name = siteName(pane);
    view.element.setAttribute('aria-label', name);
    view.element.querySelector('.pane-placeholder h2').textContent = name;
    if (view.frame) view.frame.title = name;
    const themeButton = view.element.querySelector('.pane-theme');
    const siteMode = pane.theme && pane.theme !== 'site' ? pane.theme : view.siteTheme;
    themeButton.disabled = layoutBusy || !pane.enabled || !view.themeSupported;
    themeButton.setAttribute('aria-pressed', String(siteMode === 'dark'));
    themeButton.title = view.themeSupported ? (siteMode === 'dark' ? 'Light ' : 'Dark ') + name + ' theme' : 'Site theme unavailable';
    themeButton.setAttribute('aria-label', themeButton.title);
    view.handle.disabled = layoutBusy && reorder?.id !== pane.id;
    view.handle.setAttribute('aria-pressed', String(pane.pinned === true));
    view.handle.title = pane.pinned ? 'Scroll independently. Click to sync; drag to move.' : 'Sync with other panels. Click to pin; drag to move.';
    view.handle.setAttribute('aria-label', (pane.pinned ? 'Unpin ' : 'Pin ') + name + '. Drag or use arrow keys to move.');
    view.handle.querySelector('path').setAttribute('d', pane.pinned ? view.pinOutline.slice(0, view.pinOutline.indexOf('Z') + 1) : view.pinOutline);
    for (const [selector, label] of [['.pane-reload','Reload '],['.pane-select','Change site: '],['.pane-close','Close ']]) {
      const button = view.element.querySelector(selector);
      button.disabled = layoutBusy;
      button.title = label + name; button.setAttribute('aria-label', label + name);
    }
  }
  for (const option of chooser.children) option.disabled = layoutBusy || (!pickerPaneId && state.panes.length >= maxPanes);
}
async function replacePane(id, url, button) {
  if (layoutBusy) return;
  const pane = state.panes.find(item => item.id === id); if (!pane) return;
  if (pane.url === url) {
    if (!pane.enabled || !views.get(id)?.frame) {
      await openPane(pane, button);
      if (pane.enabled) closePicker();
    } else closePicker();
    return;
  }
  const permission = chrome.permissions.request({ origins: [parseSite(url).pattern] });
  layoutBusy = true; renderControls(); button.disabled = true;
  try {
    if (!await permission) { workspaceStatus.textContent = 'Site access denied. Current site kept.'; return; }
    const next = { ...pane, url, enabled: true };
    const panes = state.panes.map(item => item.id === id ? next : item);
    await chrome.storage.local.set({ workspace: { ...state, panes } });
    removeFrame(id); state.panes = panes;
    await configure();
    if (next.enabled) mountFrame(next);
    closePicker(); workspaceStatus.textContent = '';
  } catch (error) { workspaceStatus.textContent = error.message; }
  finally { layoutBusy = false; renderControls(); }
}
async function addPane(pane, archived = false) {
  if (layoutBusy || state.panes.length >= maxPanes) return;
  const origins = [parseSite(pane.url).pattern];
  layoutBusy = true; renderControls();
  try {
    const enabled = await chrome.permissions.contains({ origins });
    if (!enabled) throw new Error('Site access required.');
    if (state.panes.length >= maxPanes || state.panes.some(item => item.id === pane.id)) return;
    const next = { ...pane, enabled, pinned: pane.pinned === true, theme: pane.theme || 'site' };
    const archive = archived ? overflowPanes.filter(item => item.id !== pane.id) : overflowPanes;
    await chrome.storage.local.set({ workspace: { ...state, panes: [...state.panes, next] }, workspaceOverflow: archive });
    state.panes.push(next); overflowPanes = archive; addView(next); renderControls();
    await configure();
    if (next.enabled) mountFrame(next);
    closePicker();
  } catch (error) { workspaceStatus.textContent = error.message; }
  finally { layoutBusy = false; renderControls(); }
}
async function removePane(id) {
  if (layoutBusy) return;
  layoutBusy = true;
  const next = state.panes.filter(pane => pane.id !== id);
  try { await chrome.storage.local.set({ workspace: { ...state, panes: next } }); }
  catch (error) { layoutBusy = false; workspaceStatus.textContent = error.message; renderControls(); return; }
  removeFrame(id); views.get(id).element.remove(); views.delete(id); state.panes = next;
  await configure().catch(() => {}); layoutBusy = false; renderControls();
}
async function movePane(id, targetIndex) {
  const index = state.panes.findIndex(pane => pane.id === id);
  if (layoutBusy || index < 0 || targetIndex === index || targetIndex < 0 || targetIndex >= state.panes.length) return;
  if (!panels.moveBefore) { workspaceStatus.textContent = 'Update Chrome to reorder panels.'; return; }
  layoutBusy = true;
  const previous = [...state.panes], next = [...state.panes];
  const [pane] = next.splice(index, 1); next.splice(targetIndex, 0, pane);
  setPaneOrder(next);
  try { await save(); announce(`${siteName(pane)} at position ${targetIndex + 1}.`); }
  catch (error) { setPaneOrder(previous); workspaceStatus.textContent = error.message; }
  layoutBusy = false; renderControls(); views.get(id)?.handle.focus();
}
function setPaneOrder(order) {
  for (let position = order.length - 1; position >= 0; position--) {
    const next = position === order.length - 1 ? null : views.get(order[position + 1].id).element;
    panels.moveBefore(views.get(order[position].id).element, next);
  }
  state.panes = order;
}
for (const site of socialSites) {
  const button = document.createElement('button'); button.className = 'social-option'; button.type = 'button'; button.dataset.site = site.name;
  button.textContent = site.name;
  button.addEventListener('click', () => {
    if (pickerPaneId) void replacePane(pickerPaneId, site.url, button);
  }); chooser.append(button);
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'pane-theme') {
    const view = views.get(message.paneId);
    if (view && (!view.documentId || view.documentId === message.documentId)) {
      view.themeSupported = message.supported === true;
      view.siteTheme = message.mode || 'light';
      renderControls();
    }
    return;
  }
  if (message.type !== 'pane-status') return;
  const view = views.get(message.paneId); if (!view) return;
  if (message.status === 'connected') { view.documentId = message.documentId; clearTimeout(view.timer); status(view.id, 'connected', 'Connected'); }
  if (message.status === 'disconnected') status(view.id, 'loading', 'Reconnecting...');
  if (message.status === 'permission') { const pane = state.panes.find(item => item.id === view.id); pane.enabled = false; removeFrame(view.id); status(view.id, 'permission', message.detail); void save(); }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'workspace-controls') return;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) {
    respond({ ok: false, error: 'Invalid control source.' }); return;
  }
  (async () => {
    await initialized;
    if (message.action !== 'get' && layoutBusy) throw new Error('Workspace is busy.');
    if (message.action === 'reload') await reloadAll();
    else if (message.action === 'add') {
      if (state.panes.length >= maxPanes) throw new Error('Three sites maximum.');
      const archived = message.archiveId ? overflowPanes.find(pane => pane.id === message.archiveId && pane.url === message.url) : null;
      if (message.archiveId ? !archived : !socialSites.some(site => site.url === message.url)) throw new Error('Invalid site.');
      if (!await chrome.permissions.contains({ origins: [parseSite(message.url).pattern] })) throw new Error('Site access required.');
      // Recheck after permission lookup; a panel operation may have started meanwhile.
      if (layoutBusy || state.panes.length >= maxPanes) throw new Error('Workspace changed. Try again.');
      const count = state.panes.length;
      await addPane(archived || { id: crypto.randomUUID(), url: message.url, enabled: true }, Boolean(archived));
      if (state.panes.length === count) throw new Error(workspaceStatus.textContent || 'Unable to add site.');
    } else if (message.action !== 'get') throw new Error('Invalid control action.');
    return { ok: true, busy: layoutBusy, count: state.panes.length,
      enabled: state.panes.some(pane => pane.enabled), archive: overflowPanes.map(({ id, url }) => ({ id, url })) };
  })().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
async function initialize() {
  const storage = await chrome.storage.local.get(['workspace', 'workspaceOverflow']);
  const normalized = normalizeWorkspace(storage.workspace, storage.workspaceOverflow);
  state = normalized.workspace; overflowPanes = normalized.workspaceOverflow;
  await chrome.storage.local.set(normalized);
  for (const pane of state.panes) addView(pane);
  renderControls(); await configure();
  for (const pane of state.panes.filter(item => item.enabled)) mountFrame(pane);
}
const initialized = initialize();
initialized.catch(error => { workspaceStatus.textContent = error.message; });
