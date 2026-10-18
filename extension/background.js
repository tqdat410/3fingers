import { makeFrameRule, parseSite, sitePermissionOrigins, validPane, validScroll, isIndependentSocial } from './shared/core.js';
import { applySocialTheme, installTikTokThemeCookies } from './shared/social-theme.js';

const workspaceUrl = chrome.runtime.getURL('workspace.html');
const maxPanes = 3;
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
  return Promise.all(panes.map(async pane => ({ ...pane, enabled: pane.enabled && await chrome.permissions.contains({ origins: sitePermissionOrigins(pane.url) }) })));
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
    const panes = message.panes.map(p => ({ id: p.id, url: parseSite(p.url).url, enabled: p.enabled, pinned: p.pinned === true, theme: p.theme || 'site' }));
    const authorized = await permittedPanes(panes);
    if (authorized.some(pane => pane.enabled && parseSite(pane.url).host === 'www.threads.com')) await syncPrefetchScript();
    const previous = sessions[sender.tab.id];
    for (const old of previous?.panes || []) {
      const current = authorized.find(p => p.id === old.id);
      if (!current?.enabled || current.url !== old.url) disconnectPane(sender.tab.id, old.id);
      if (current?.url === old.url) {
        current.history = old.history;
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
        if (!result.supported && pane.theme !== 'site') throw new Error('Site theme unavailable.');
      }
    }
    return { session: session.token, panes: authorized.map(({ id, enabled, documentId }) => ({ id, enabled,
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
        connection = { port, tabId, paneId: pane.id, documentId: sender.documentId, sequence: -1 };
        connections.set(`${tabId}:${pane.id}`, connection);
        port.postMessage({ type: 'ready', session: session.token, documentId: connection.documentId,
          nativeScrolling: isIndependentSocial(pane.url), watchInteractions: session.watchInteractions === true });
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
      if (pane && parseSite(pane.url).host === 'www.tiktok.com') {
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
      try { url = parseSite(message.url); } catch { return; }
      if (url.origin !== parseSite(pane.url).origin) return;
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
    if (!source?.enabled || source.pinned || isIndependentSocial(source.url) || message.delta === 0) return;
    for (const follower of connections.values()) {
      if (follower.tabId === connection.tabId && follower !== connection
        && session.panes.some(pane => pane.id === follower.paneId && pane.enabled && !pane.pinned && !isIndependentSocial(pane.url))) {
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
    documentId: connection.documentId, canGoBack: pane.history?.length > 1 }, { frameId: 0 }).catch(() => {});
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
      connection.port.postMessage({ type: 'back', session: sessions[sender.tab.id].token, url: pane.history.at(-1) });
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
    const target = { tabId: details.tabId, frameIds: [details.frameId] };
    await chrome.scripting.insertCSS({ target, files: ['feed-chrome.css'] });
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
    await updateTheme(details.tabId, pane);
  }).catch(() => {});
});

async function updateTheme(tabId, pane) {
  const target = { tabId: Number(tabId), documentIds: [pane.documentId] };
  let available = true;
  if (parseSite(pane.url).host === 'www.tiktok.com') {
    const bridge = await chrome.scripting.executeScript({ target, world: 'MAIN', func: installTikTokThemeCookies,
      args: [new URL(workspaceUrl).origin] });
    available = bridge[0]?.result === true;
  }
  const results = available ? await chrome.scripting.executeScript({ target, func: applySocialTheme, args: [pane.theme || 'site'] }) : [];
  const result = results[0]?.result || { supported: false };
  if (result.native && result.supported) {
    pane.theme = 'site';
    await chrome.storage.session.set({ sessions, nextRuleId });
  }
  chrome.tabs.sendMessage(Number(tabId), { type: 'pane-theme', paneId: pane.id, documentId: pane.documentId, ...result }, { frameId: 0 }).catch(() => {});
  return result;
}

chrome.tabs.onRemoved.addListener(tabId => serial(() => cleanup(tabId)).catch(console.error));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url && change.url !== workspaceUrl) serial(() => cleanup(tabId)).catch(console.error);
});
chrome.permissions.onAdded.addListener(() => serial(syncPrefetchScript).catch(console.error));
chrome.permissions.onRemoved.addListener(() => serial(async () => {
  await syncPrefetchScript();
  for (const [tabId, session] of Object.entries(sessions)) {
    session.panes = await permittedPanes(session.panes);
    for (const pane of session.panes.filter(p => !p.enabled)) {
      disconnectPane(tabId, pane.id);
      notify(tabId, pane.id, 'permission', 'Site access revoked.');
    }
  }
  await refreshRules();
}).catch(console.error));
