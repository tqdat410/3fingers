export function parseSite(value) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Remove credentials from the URL.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use HTTPS. HTTP is allowed on localhost only.');
  }
  return { url: url.href, origin: url.origin, host: url.hostname, pattern: `${url.protocol}//${url.hostname}/*` };
}

export function normalizedDelta(previous, current, viewport) {
  return viewport > 0 && [previous, current, viewport].every(Number.isFinite) ? (current - previous) / viewport : 0;
}

export function applyDelta(current, delta, viewport, maximum) {
  if (![current, delta, viewport, maximum].every(Number.isFinite)) return current;
  return Math.max(0, Math.min(Math.max(0, maximum), current + delta * viewport));
}

export function validScroll(message, session, previousSequence = -1) {
  return message?.type === 'scroll' && message.session === session && Number.isSafeInteger(message.sequence)
    && message.sequence > previousSequence && Number.isFinite(message.delta) && Math.abs(message.delta) <= 10;
}

export function validPane(pane) {
  return pane && /^[a-zA-Z0-9_-]{1,64}$/.test(pane.id) && typeof pane.url === 'string' && typeof pane.enabled === 'boolean'
    && (pane.pinned === undefined || typeof pane.pinned === 'boolean');
}

export const socialSites = [
  { name: 'Facebook', url: 'https://www.facebook.com/', mark: 'f' },
  { name: 'Instagram', url: 'https://www.instagram.com/', mark: '◎' },
  { name: 'Threads', url: 'https://www.threads.com/', mark: '@' },
];

export function normalizeWorkspace(stored, overflow = []) {
  const defaults = [socialSites[0], socialSites[2], socialSites[1]]
    .map(site => ({ id: crypto.randomUUID(), url: site.url, enabled: false, pinned: false }));
  const seen = new Set();
  const clean = panes => panes.flatMap(pane => {
    try {
      if (!validPane({ ...pane, enabled: pane?.enabled === true }) || seen.has(pane.id)) return [];
      const url = parseSite(pane.url).url;
      seen.add(pane.id);
      return [{ id: pane.id, url, enabled: pane.enabled === true, pinned: pane.pinned === true }];
    } catch { return []; }
  });
  const panes = Array.isArray(stored?.panes) ? clean(stored.panes) : defaults;
  const archive = [...panes.slice(3), ...clean(Array.isArray(overflow) ? overflow : [])];
  return { workspace: { panes: panes.slice(0, 3), sync: stored ? stored.sync === true : true }, workspaceOverflow: archive };
}

export function makeFrameRule(id, tabId, url) {
  const { origin, host } = parseSite(url);
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const metaSite = ['facebook.com', 'instagram.com', 'threads.com'].some(domain => host === domain || host.endsWith(`.${domain}`));
  return {
    id, priority: 1,
    action: { type: 'modifyHeaders', ...(metaSite ? { requestHeaders: [
      { header: 'sec-fetch-dest', operation: 'set', value: 'document' }
    ] } : {}), responseHeaders: [
      { header: 'x-frame-options', operation: 'remove' },
      { header: 'content-security-policy', operation: 'remove' }
    ] },
    condition: { regexFilter: `^${escaped}/`, requestDomains: [host], resourceTypes: ['sub_frame'], tabIds: [tabId] }
  };
}
