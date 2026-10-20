import { makeFrameRule, parseSite, sitePermissions, siteFrameUrl, validPane, validScroll, isIndependentSocial } from './shared/core.js';
import { applySocialTheme } from './shared/social-theme.js';
import { handleActionClick, updateActionPopup } from './shared/workspace-tabs.js';
import { csrfSites, installSiteCsrf } from './shared/site-csrf.js';

const workspaceUrl = chrome.runtime.getURL('workspace.html');
const maxPanes = 3;
chrome.action.onClicked.addListener(tab => { handleActionClick(tab).catch(console.error); });
chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(updateActionPopup))).catch(console.error);
const prefetchScriptId = 'threads-prefetch';
const connections = new Map();
let sessions = {};
let nextRuleId = 1;
let queue = Promise.resolve();
const restored = chrome.storage.session.get(['sessions', 'nextRuleId']).then(async data => {
  sessions = data.sessions || {};
  nextRuleId = data.nextRuleId || 1;
  for (const [id, session] of Object.entries(sessions)) {
    delete session.sync;
    const tab = await chrome.tabs.get(Number(id)).catch(() => null);
    if (tab?.url !== workspaceUrl) delete sessions[id];
    else session.panes = await permittedPanes(session.panes);
  }
  await syncPrefetchScript();
  await refreshRules();
});

async function syncPrefetchScript() {
  try {
    const allowed = await chrome.permissions.contains({ origins: ['https://www.threads.com/*'] });
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [prefetchScriptId] });
    if (allowed && !registered.length) {
      await chrome.scripting.registerContentScripts([{
        id: prefetchScriptId, matches: ['https://www.threads.com/*'],
        js: ['threads-prefetch.js'], allFrames: true, world: 'MAIN',
        runAt: 'document_start', persistAcrossSessions: false,
      }]);
    } else if (!allowed && registered.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [prefetchScriptId] });
    }
  } catch (error) {
    // Prefetch is optional; registration failure must not disable the workspace.
    console.warn('Threads prefetch unavailable:', error.message);
  }
}

function serial(operation) {
  const result = queue.then(() => restored).then(operation);
  queue = result.catch(() => {});
  return result;
}

async function permittedPanes(panes) {
  return Promise.all(panes.map(async pane => {
    const access = await siteAccess(pane.url);
    return { ...pane, enabled: pane.enabled && access.allowed, accessError: access.error };
  }));
}

async function siteAccess(url) {
  if (parseSite(url).origin === 'https://x.com' && await chrome.permissions.contains({ origins: ['https://api.x.com/*'] })) {
    return { allowed: false, error: 'X needs narrow site access. Remove api.x.com or broader access in extension settings, then Open again.' };
  }
  return { allowed: await chrome.permissions.contains(sitePermissions(url)), error: '' };
}

async function refreshRules() {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const addRules = [];
  for (const [tabId, session] of Object.entries(sessions)) {
    for (const pane of session.panes.filter(p => p.enabled)) {
      pane.ruleId ||= nextRuleId++;
      addRules.push(makeFrameRule(pane.ruleId, Number(tabId), pane.url));
    }
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: existing.map(rule => rule.id), addRules });
  await chrome.storage.session.set({ sessions, nextRuleId });
}

function disconnectPane(tabId, paneId) {
  const key = `${tabId}:${paneId}`;
  const connection = connections.get(key);
  connections.delete(key);
  connection?.port.disconnect();
}

function notify(tabId, paneId, status, detail = '', documentId = null) {
  chrome.tabs.sendMessage(Number(tabId), { type: 'pane-status', paneId, status, detail, documentId }, { frameId: 0 }).catch(() => {});
}

async function cleanup(tabId) {
  if (!sessions[tabId]) return;
  for (const pane of sessions[tabId].panes) disconnectPane(tabId, pane.id);
  delete sessions[tabId];
  await refreshRules();
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'configure') return;
  serial(async () => {
    if (sender.frameId !== 0 || sender.url !== workspaceUrl || !sender.tab?.id) throw new Error('Invalid workspace.');
    if ((await chrome.tabs.get(sender.tab.id)).url !== workspaceUrl) throw new Error('Workspace tab closed.');
    if (!Array.isArray(message.panes) || message.panes.length > maxPanes || !message.panes.every(validPane)
      || new Set(message.panes.map(p => p.id)).size !== message.panes.length) throw new Error('Invalid panel list.');
    const panes = message.panes.map(p => ({ id: p.id, url: siteFrameUrl(p.url), enabled: p.enabled, pinned: p.pinned === true, theme: p.theme || 'site' }));
    const authorized = await permittedPanes(panes);
    if (authorized.some(pane => pane.enabled && parseSite(pane.url).host === 'www.threads.com')) await syncPrefetchScript();
    const previous = sessions[sender.tab.id];
    for (const old of previous?.panes || []) {
      const current = authorized.find(p => p.id === old.id);
      if (!current?.enabled || current.url !== old.url) disconnectPane(sender.tab.id, old.id);
      if (current?.url === old.url) {
        current.history = old.history?.map(siteFrameUrl).filter((url, index, urls) => index === 0 || urls[index - 1] !== url);
        current.ruleId = old.ruleId;
        current.frameId = old.frameId;
        current.documentId = old.documentId;
      }
    }
    const session = { token: previous?.token || crypto.randomUUID(), panes: authorized, watchInteractions: previous?.watchInteractions === true };
    sessions[sender.tab.id] = session;
    await refreshRules();
    for (const pane of authorized) {
      if (pane.enabled && pane.documentId && previous?.panes.find(old => old.id === pane.id)?.theme !== pane.theme) {
        const result = await updateTheme(sender.tab.id, pane);
        if (result.applied === false) throw new Error(result.error || 'Site theme change failed.');
        if (!result.supported && pane.theme !== 'site') throw new Error('Site theme unavailable.');
      }
    }
    return { session: session.token, panes: authorized.map(({ id, enabled, documentId, accessError }) => ({ id, enabled, accessError,
      documentId: connections.get(`${sender.tab.id}:${id}`)?.documentId === documentId ? documentId : null })) };
  }).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== '3fingers-feed') return port.disconnect();
  let connection;
  let handshakeStarted = false;
  port.onMessage.addListener(message => {
    if (!connection) {
      if (handshakeStarted || message?.type !== 'hello') return port.disconnect();
      handshakeStarted = true;
      serial(async () => {
        const sender = port.sender;
        const tabId = sender?.tab?.id;
        const session = sessions[tabId];
        const pane = session?.panes.find(p => p.id === message.paneId && p.enabled);
        const frame = sender && await chrome.webNavigation.getFrame({ tabId, frameId: sender.frameId });
        if (!pane || session.token !== message.session || pane.frameId !== sender.frameId || pane.documentId !== sender.documentId
          || sender.frameId === 0 || frame?.parentFrameId !== 0
          || frame.documentId !== sender.documentId || frame.url !== sender.url
          || parseSite(sender.url).origin !== parseSite(pane.url).origin
          || (await chrome.tabs.get(tabId)).url !== workspaceUrl) throw new Error('Frame outside workspace.');
        disconnectPane(tabId, pane.id);
        connection = { port, tabId, paneId: pane.id, documentId: sender.documentId, url: frame.url, sequence: -1 };
        connections.set(`${tabId}:${pane.id}`, connection);
        port.postMessage({ type: 'ready', session: session.token, documentId: connection.documentId,
          nativeScrolling: isIndependentSocial(connection.url), watchInteractions: session.watchInteractions === true });
        notify(tabId, pane.id, 'connected', '', connection.documentId);
      }).catch(() => port.disconnect());
      return;
    }
    const session = sessions[connection.tabId];
    if (session && message?.session === session.token && message.type === 'interaction' && session.watchInteractions) {
      chrome.tabs.sendMessage(connection.tabId, { type: 'pane-interaction', documentId: connection.documentId }, { frameId: 0 }).catch(() => {});
      return;
    }
    if (session && message?.session === session.token && message.type === 'native-theme' && ['light', 'dark'].includes(message.mode)) {
      const pane = session.panes.find(pane => pane.id === connection.paneId && pane.enabled && pane.documentId === connection.documentId);
      if (pane && ['www.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tiktok.com', 'www.reddit.com', 'www.youtube.com', 'x.com'].includes(parseSite(pane.url).host)) {
        pane.theme = 'site';
        chrome.storage.session.set({ sessions, nextRuleId }).catch(console.error);
        chrome.tabs.sendMessage(connection.tabId, {
          type: 'pane-theme', paneId: pane.id, documentId: connection.documentId, supported: true, native: true, mode: message.mode,
        }, { frameId: 0 }).catch(() => {});
      }
      return;
    }
    if (session && message?.type === 'navigation' && message.session === session.token && typeof message.url === 'string') {
      const pane = session.panes.find(pane => pane.id === connection.paneId && pane.enabled && pane.documentId === connection.documentId);
      if (!pane) return;
      let url;
      try { url = parseSite(siteFrameUrl(message.url)); } catch { return; }
      if (url.origin !== parseSite(pane.url).origin) return;
      connection.url = url.url;
      connection.port.postMessage({ type: 'scroll-policy', session: session.token, url: message.url, nativeScrolling: isIndependentSocial(connection.url) });
      pane.history ||= [];
      if (pane.history.at(-1) !== url.url) {
        const previous = message.kind === 'traverse' ? pane.history.lastIndexOf(url.url) : -1;
        if (previous >= 0) pane.history = pane.history.slice(0, previous + 1);
        else if (message.kind === 'replace' && pane.history.length) pane.history[pane.history.length - 1] = url.url;
        else pane.history.push(url.url);
        pane.history = pane.history.slice(-50);
      }
      chrome.storage.session.set({ sessions, nextRuleId }).catch(console.error);
      notifyNavigation(connection, pane);
      return;
    }
    if (!session || !validScroll(message, session.token, connection.sequence)) return;
    connection.sequence = message.sequence;
    const source = session.panes.find(pane => pane.id === connection.paneId);
    if (!source?.enabled || source.pinned || isIndependentSocial(connection.url || source.url) || message.delta === 0) return;
    for (const follower of connections.values()) {
      if (follower.tabId === connection.tabId && follower !== connection
        && session.panes.some(pane => pane.id === follower.paneId && pane.enabled && !pane.pinned && !isIndependentSocial(follower.url || pane.url))) {
        try { follower.port.postMessage({ type: 'apply', session: session.token, delta: message.delta }); } catch { /* disconnected port */ }
      }
    }
  });
  port.onDisconnect.addListener(() => {
    if (connection && connections.get(`${connection.tabId}:${connection.paneId}`) === connection) {
      connections.delete(`${connection.tabId}:${connection.paneId}`);
      notify(connection.tabId, connection.paneId, 'disconnected');
    }
  });
});

function notifyNavigation(connection, pane) {
  chrome.tabs.sendMessage(connection.tabId, { type: 'pane-navigation', paneId: connection.paneId,
    documentId: connection.documentId, canGoBack: pane.history?.length > 1,
    nativeScrolling: isIndependentSocial(connection.url || pane.url) }, { frameId: 0 }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['pane-back', 'watch-interactions'].includes(message?.type)) return;
  serial(async () => {
    if (sender.frameId !== 0 || sender.url !== workspaceUrl || !sender.tab?.id
      || (await chrome.tabs.get(sender.tab.id)).url !== workspaceUrl) throw new Error('Invalid workspace.');
    if (message.type === 'watch-interactions') {
      const session = sessions[sender.tab.id];
      if (!session) return;
      session.watchInteractions = message.enabled === true;
      for (const connection of connections.values()) if (connection.tabId === sender.tab.id) {
        connection.port.postMessage({ type: 'watch-interactions', session: session.token, enabled: session.watchInteractions });
      }
      return;
    }
    const pane = sessions[sender.tab.id]?.panes.find(pane => pane.id === message.paneId && pane.enabled);
    const connection = connections.get(`${sender.tab.id}:${message.paneId}`);
    if (!pane || !connection || connection.documentId !== pane.documentId) throw new Error('Panel unavailable.');
    if (pane.history?.length > 1) {
      pane.history.pop();
      connection.port.postMessage({ type: 'back', session: sessions[sender.tab.id].token, url: siteFrameUrl(pane.history.at(-1)) });
      notifyNavigation(connection, pane);
      await chrome.storage.session.set({ sessions, nextRuleId });
    }
  }).then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId === 0) {
    if (details.url !== workspaceUrl) serial(() => cleanup(details.tabId)).catch(console.error);
    return;
  }
  serial(async () => {
    const frame = await chrome.webNavigation.getFrame({ tabId: details.tabId, frameId: details.frameId });
    if (frame?.parentFrameId !== 0 || frame.documentId !== details.documentId) return;
    const session = sessions[details.tabId];
    if (!session || !session.panes.some(p => p.enabled && parseSite(p.url).origin === new URL(details.url).origin)) return;
    if ((await chrome.tabs.get(details.tabId)).url !== workspaceUrl) return;
    let pane = session.panes.find(p => p.enabled && p.frameId === details.frameId);
    if (pane && parseSite(pane.url).origin !== new URL(details.url).origin) {
      disconnectPane(details.tabId, pane.id);
      notify(details.tabId, pane.id, 'disconnected');
      return;
    }
    if (!pane) {
      const results = await chrome.scripting.executeScript({ target: { tabId: details.tabId, frameIds: [details.frameId] }, func: () => window.name });
      pane = session.panes.find(p => p.enabled && parseSite(p.url).origin === new URL(details.url).origin
        && results[0]?.result === `3fingers:${p.id}:${session.token}`);
    }
    if (!pane) return;
    if (pane.documentId && pane.documentId !== details.documentId) {
      disconnectPane(details.tabId, pane.id);
      notify(details.tabId, pane.id, 'disconnected');
    }
    pane.frameId = details.frameId;
    pane.documentId = details.documentId;
    await chrome.storage.session.set({ sessions, nextRuleId });
    await updateSiteCsrf(details.tabId, pane);
    const target = { tabId: details.tabId, documentIds: [details.documentId] };
    await chrome.scripting.insertCSS({ target, files: ['feed-chrome.css'] });
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
    // Module readiness must not hold the shared configure/scroll connection queue.
    updateTheme(details.tabId, pane).catch(() => {});
  }).catch(() => {});
});

async function updateTheme(tabId, pane) {
  const target = { tabId: Number(tabId), documentIds: [pane.documentId] };
  const results = await chrome.scripting.executeScript({ target, world: 'MAIN', func: applySocialTheme, args: [pane.theme || 'site'] });
  const result = results[0]?.result || { supported: false };
  const current = sessions[tabId]?.panes.find(current => current.id === pane.id && current.enabled && current.documentId === target.documentIds[0]);
  if (!current) return { supported: false };
  pane = current;
  if (result.supported && result.reloadRequired) {
    pane.theme = 'site';
    await chrome.storage.session.set({ sessions, nextRuleId });
    if (!sessions[tabId]?.panes.some(p => p.id === pane.id && p.enabled && p.documentId === target.documentIds[0])) return { supported: false };
    disconnectPane(Number(tabId), pane.id);
    notify(Number(tabId), pane.id, 'disconnected');
    await chrome.scripting.executeScript({ target, func: () => { setTimeout(() => location.reload(), 0); } });
    return { ...result, reloadRequired: false, reloadStarted: true };
  }
  // Content observers live in the isolated world; do not read page-world flags.
  await chrome.scripting.executeScript({ target, func: supported => {
    window.__threeFingersNativeThemeUnsupported = !supported;
  }, args: [result.supported === true] });
  if (sessions[tabId]?.panes.find(p => p.id === pane.id)?.documentId !== target.documentIds[0]) return { supported: false };
  if (result.native && result.supported) {
    pane.theme = 'site';
    await chrome.storage.session.set({ sessions, nextRuleId });
  }
  if (!sessions[tabId]?.panes.some(p => p.id === pane.id && p.enabled && p.documentId === target.documentIds[0])) return { supported: false };
  chrome.tabs.sendMessage(Number(tabId), { type: 'pane-theme', paneId: pane.id, documentId: pane.documentId, ...result }, { frameId: 0 }).catch(() => {});
  return result;
}

async function updateSiteCsrf(tabId, pane) {
  const origin = parseSite(pane.url).origin;
  const policy = csrfSites[origin];
  if (!pane.enabled || !pane.documentId || !policy) return;
  const frame = await chrome.webNavigation.getFrame({ tabId: Number(tabId), frameId: pane.frameId });
  if (frame?.parentFrameId !== 0 || frame.documentId !== pane.documentId
    || new URL(frame.url).origin !== origin
    || (await chrome.tabs.get(Number(tabId))).url !== workspaceUrl) return;
  let value = null;
  let expires = 0;
  if ((await siteAccess(pane.url)).allowed) {
    const cookie = await chrome.cookies.get({ url: origin + '/', name: policy.name });
    value = cookie && !cookie.httpOnly ? cookie.value : '';
    expires = cookie?.expirationDate || 0;
  }
  await chrome.scripting.executeScript({ target: { tabId: Number(tabId), documentIds: [pane.documentId] },
    world: 'MAIN', func: installSiteCsrf, args: [value, new URL(workspaceUrl).origin, expires] });
}

function siteCookieChanged({ cookie }) {
  const origins = Object.entries(csrfSites).filter(([, policy]) => policy.name === cookie.name && policy.domains.includes(cookie.domain)).map(([origin]) => origin);
  if (!origins.length) return;
  serial(async () => {
    for (const [tabId, session] of Object.entries(sessions)) {
      for (const pane of session.panes.filter(pane => origins.includes(parseSite(pane.url).origin))) await updateSiteCsrf(tabId, pane).catch(() => {});
    }
  }).catch(() => {});
}

function watchSiteCookies() {
  const event = chrome.cookies?.onChanged;
  if (event && !event.hasListener(siteCookieChanged)) event.addListener(siteCookieChanged);
}
watchSiteCookies();

chrome.tabs.onRemoved.addListener(tabId => serial(() => cleanup(tabId)).catch(console.error));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') updateActionPopup(tab).catch(() => {});
  if (change.url && change.url !== workspaceUrl) serial(() => cleanup(tabId)).catch(console.error);
});
chrome.permissions.onAdded.addListener(() => {
  watchSiteCookies();
  serial(refreshPermissions).catch(console.error);
});
async function refreshPermissions() {
  await syncPrefetchScript();
  for (const [tabId, session] of Object.entries(sessions)) {
    const previouslyEnabled = new Set(session.panes.filter(pane => pane.enabled).map(pane => pane.id));
    for (const pane of session.panes) await updateSiteCsrf(tabId, pane).catch(() => {});
    session.panes = await permittedPanes(session.panes);
    for (const pane of session.panes.filter(p => !p.enabled && (previouslyEnabled.has(p.id) || p.accessError))) {
      disconnectPane(tabId, pane.id);
      notify(tabId, pane.id, 'permission', pane.accessError || 'Site access revoked.');
    }
  }
  await refreshRules();
}
chrome.permissions.onRemoved.addListener(() => serial(refreshPermissions).catch(console.error));
