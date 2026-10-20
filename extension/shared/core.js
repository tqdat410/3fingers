export function parseSite(value) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Remove credentials from the URL.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use HTTPS. HTTP is allowed on localhost only.');
  }
  return { url: url.href, origin: url.origin, host: url.hostname, pattern: `${url.protocol}//${url.hostname}/*` };
}

export function sitePermissionOrigins(value) {
  const { host, pattern } = parseSite(value);
  // Video requests use additional TikTok subdomains in the embedded player.
  return [isTikTokHost(host) ? 'https://*.tiktok.com/*' : pattern];
}

export function sitePermissions(value) {
  const origins = sitePermissionOrigins(value);
  return parseSite(value).origin === 'https://www.reddit.com'
    // Cookie-change notifications for .reddit.com require the parent host too.
    ? { origins: [...origins, 'https://reddit.com/*'], permissions: ['cookies'] }
    : parseSite(value).origin === 'https://x.com' ? { origins, permissions: ['cookies'] } : { origins };
}

export function siteFrameUrl(value) {
  const url = new URL(parseSite(value).url);
  if (url.origin === 'https://x.com') {
    if (url.pathname === '/') url.pathname = '/home';
    // X's current Service Worker excludes lang URLs from its cached app shell.
    if (!url.searchParams.has('lang')) url.searchParams.set('lang', '');
  }
  return url.href;
}

const isTikTokHost = host => host === 'tiktok.com' || host.endsWith('.tiktok.com');

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
    && (pane.pinned === undefined || typeof pane.pinned === 'boolean')
    && (pane.theme === undefined || ['site', 'light', 'dark'].includes(pane.theme));
}

const youtubeShortsUrl = 'https://www.youtube.com/shorts/';

export const socialSites = [
  { name: 'Facebook', url: 'https://www.facebook.com/', mark: 'f' },
  { name: 'Instagram', url: 'https://www.instagram.com/', mark: '◎' },
  { name: 'Threads', url: 'https://www.threads.com/', mark: '@' },
  { name: 'TikTok', url: 'https://www.tiktok.com/foryou', mark: '♪' },
  { name: 'X', url: 'https://x.com/home?lang=', mark: '𝕏' },
  { name: 'Reddit', url: 'https://www.reddit.com/', mark: 'r' },
  { name: 'YouTube Shorts', url: youtubeShortsUrl, mark: '▶' },
];

export function isIndependentSocial(url) {
  const { host } = parseSite(url);
  const path = new URL(url).pathname;
  const metaReels = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'instagram.com', 'www.instagram.com'].includes(host)
    && /^\/reels?(?:\/|$)/.test(path);
  return metaReels || isTikTokHost(host) || host === 'youtube.com' || host.endsWith('.youtube.com');
}

export function normalizeWorkspace(stored, overflow = []) {
  const defaults = [socialSites[0], socialSites[2], socialSites[1]]
    .map(site => ({ id: crypto.randomUUID(), url: site.url, enabled: false, pinned: false, theme: 'site' }));
  const seen = new Set();
  const clean = panes => panes.flatMap(pane => {
    try {
      if (!validPane({ ...pane, enabled: pane?.enabled === true }) || seen.has(pane.id)) return [];
      const site = parseSite(pane.url);
      // Former full-site panels reopen in Shorts; keep saved Shorts links intact.
      const url = site.host === 'www.youtube.com' && !/^\/shorts(?:\/|$)/.test(new URL(site.url).pathname)
        ? youtubeShortsUrl : site.url;
      seen.add(pane.id);
      // Native app preferences own themes; retire saved palette overrides.
      return [{ id: pane.id, url: siteFrameUrl(url), enabled: pane.enabled === true, pinned: pane.pinned === true, theme: 'site' }];
    } catch { return []; }
  });
  const panes = Array.isArray(stored?.panes) ? clean(stored.panes) : defaults;
  const archive = [...panes.slice(3), ...clean(Array.isArray(overflow) ? overflow : [])];
  const workspace = { panes: panes.slice(0, 3) };
  if (workspace.panes.length === 2 && workspace.panes.some(pane => pane.id === stored?.split?.id)
    && [1, 2].includes(stored?.split?.share)) workspace.split = { id: stored.split.id, share: stored.split.share };
  return { workspace, workspaceOverflow: archive };
}

export function paneWeights(workspace) {
  const split = workspace.split;
  const valid = workspace.panes.length === 2 && [1, 2].includes(split?.share)
    && workspace.panes.some(pane => pane.id === split.id);
  return workspace.panes.map(pane => valid ? (pane.id === split.id ? split.share : 3 - split.share) : 1);
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
