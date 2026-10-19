import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedDelta, applyDelta, parseSite, sitePermissionOrigins, sitePermissions, siteFrameUrl, makeFrameRule, validScroll, validPane, normalizeWorkspace, paneWeights, isIndependentSocial, socialSites } from '../../extension/shared/core.js';

test('Reddit and YouTube extend the chooser without changing defaults, capacity or exact grants', () => {
  assert.deepEqual(socialSites.map(site => site.name), ['Facebook', 'Instagram', 'Threads', 'TikTok', 'Reddit', 'YouTube Shorts', 'X']);
  assert.deepEqual(normalizeWorkspace().workspace.panes.map(pane => pane.url),
    ['https://www.facebook.com/', 'https://www.threads.com/', 'https://www.instagram.com/']);
  for (const site of socialSites.slice(4)) {
    assert.deepEqual(sitePermissionOrigins(site.url), [parseSite(site.url).pattern]);
    const rule = makeFrameRule(17, 29, site.url);
    assert.deepEqual(rule.condition.tabIds, [29]);
    assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
    assert.deepEqual(rule.condition.requestDomains, [new URL(site.url).hostname]);
    assert.equal(rule.action.requestHeaders, undefined);
    assert(!new RegExp(rule.condition.regexFilter).test('https://accounts.google.com/'));
  }
  const panes = socialSites.map((site, index) => ({ id: `social-${index}`, url: site.url, enabled: true }));
  const result = normalizeWorkspace({ panes });
  assert.equal(result.workspace.panes.length, 3);
  assert.equal(result.workspaceOverflow.length, 4);
});

test('YouTube Shorts remains independent while Reddit can join sync', () => {
  for (const route of ['/', '/results?search_query=test', '/watch?v=test', '/shorts/test']) {
    assert.equal(isIndependentSocial(`https://www.youtube.com${route}`), true);
  }
  for (const host of ['youtube.com', 'm.youtube.com']) assert.equal(isIndependentSocial(`https://${host}/`), true);
  for (const url of ['https://www.reddit.com/', 'https://www.reddit.com/r/test/comments/test',
    'https://youtube.com.example.org/', 'https://notyoutube.com/', 'https://example.org/youtube.com']) {
    assert.equal(isIndependentSocial(url), false);
  }
  const pane = { id: 'youtube', url: socialSites[5].url, enabled: true, pinned: false };
  assert.equal(normalizeWorkspace({ panes: [pane] }).workspace.panes[0].pinned, false);
});

test('former YouTube panels and archives reopen in Shorts without losing preferences or split', () => {
  const makePane = (id, url) => ({ id, url, enabled: true, pinned: true, theme: 'site' });
  const stored = { panes: [makePane('yt', 'https://www.youtube.com/watch?v=old'), makePane('peer', 'https://www.facebook.com/')], split: { id: 'yt', share: 2 } };
  const archive = [makePane('home', 'https://www.youtube.com/'), makePane('search', 'https://www.youtube.com/results?search_query=old'),
    makePane('short', 'https://www.youtube.com/shorts/clip?feature=share'), makePane('other', 'https://youtube.com.example.org/watch')];
  const result = normalizeWorkspace(stored, archive);
  assert.deepEqual(result.workspace, { ...stored, panes: [{ ...stored.panes[0], url: 'https://www.youtube.com/shorts/' }, stored.panes[1]] });
  assert.deepEqual(result.workspaceOverflow.map(pane => pane.url), ['https://www.youtube.com/shorts/', 'https://www.youtube.com/shorts/', archive[2].url, archive[3].url]);
  assert.deepEqual(result.workspaceOverflow.map(({ id, pinned }) => ({ id, pinned })), archive.map(({ id, pinned }) => ({ id, pinned })));
  assert.deepEqual(normalizeWorkspace(result.workspace, result.workspaceOverflow), result);
  assert.equal(socialSites.find(site => site.name === 'YouTube Shorts').url, 'https://www.youtube.com/shorts/');
});

test('two-panel shares complement each other, follow identity and discard invalid or obsolete splits', () => {
  const panes = ['a', 'b', 'c'].map(id => ({ id, url: 'https://www.facebook.com/', enabled: true }));
  const normalized = normalizeWorkspace({ panes: panes.slice(0, 2), split: { id: 'a', share: 2 } }).workspace;
  assert.deepEqual(paneWeights(normalized), [2, 1]);
  assert.deepEqual(paneWeights({ ...normalized, panes: [...normalized.panes].reverse() }), [1, 2]);
  for (const split of [{ id: 'missing', share: 2 }, { id: 'a', share: 0 }, { id: 'a', share: '2' }, null]) {
    const workspace = normalizeWorkspace({ panes: panes.slice(0, 2), split }).workspace;
    assert.equal(workspace.split, undefined);
    assert.deepEqual(paneWeights(workspace), [1, 1]);
  }
  for (const count of [0, 1, 3]) {
    const workspace = normalizeWorkspace({ panes: panes.slice(0, count), split: normalized.split }).workspace;
    assert.equal(workspace.split, undefined);
    assert.deepEqual(paneWeights(workspace), Array(count).fill(1));
  }
});

test('TikTok media permission covers subdomains without widening frame header rules or other sites', () => {
  for (const url of ['https://www.tiktok.com/foryou', 'https://tiktok.com/', 'https://m.tiktok.com/']) {
    assert.deepEqual(sitePermissionOrigins(url), ['https://*.tiktok.com/*']);
  }
  for (const url of ['https://www.facebook.com/', 'https://www.instagram.com/', 'https://www.threads.com/',
    'https://tiktok.com.example.org/', 'https://not-tiktok.com/', 'http://localhost:3456/']) {
    assert.deepEqual(sitePermissionOrigins(url), [parseSite(url).pattern]);
  }
  assert.throws(() => sitePermissionOrigins('https://me:secret@www.tiktok.com/'));
  assert.throws(() => sitePermissionOrigins('http://www.tiktok.com/'));
  const rule = makeFrameRule(11, 23, 'https://www.tiktok.com/foryou');
  assert.deepEqual(rule.condition.requestDomains, ['www.tiktok.com']);
  assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
  assert.deepEqual(rule.condition.tabIds, [23]);
  assert.equal(rule.action.requestHeaders, undefined);
  assert(!new RegExp(rule.condition.regexFilter).test('https://v16-webapp-prime.tiktok.com/video'));
  assert.equal(parseSite('https://www.tiktok.com/foryou').pattern, 'https://www.tiktok.com/*');
});

test('TikTok always scrolls independently without matching lookalike domains', () => {
  for (const url of ['https://www.tiktok.com/foryou', 'https://tiktok.com/', 'https://m.tiktok.com/']) {
    assert.equal(isIndependentSocial(url), true);
    const pane = { id: 'tiktok', url, enabled: true, pinned: false };
    assert.equal(normalizeWorkspace({ panes: [pane] }).workspace.panes[0].pinned, false,
      'site policy does not overwrite the user pin preference');
  }
  for (const url of ['https://www.facebook.com/', 'https://www.instagram.com/', 'https://www.threads.com/',
    'https://tiktok.com.example.org/', 'https://not-tiktok.com/', 'https://example.org/tiktok.com']) {
    assert.equal(isIndependentSocial(url), false);
  }
});

test('upgrade preserves custom URLs and overflow while dropping retired settings', () => {
  const panes = ['facebook.com', 'example.org', 'instagram.com', 'threads.com']
    .map((host, index) => ({ id: `pane-${index}`, url: `https://${host}/`, enabled: true, weight: index + 1 }));
  const normalized = normalizeWorkspace({ panes, sync: false, hideSiteChrome: true }, [panes[3]]);
  assert.deepEqual(normalized.workspace.panes, panes.slice(0, 3).map(({ weight, ...pane }) => ({ ...pane, pinned: false, theme: 'site' })));
  assert.deepEqual(normalized.workspaceOverflow, [((({ weight, ...pane }) => ({ ...pane, pinned: false, theme: 'site' }))(panes[3]))]);
  assert.deepEqual(normalizeWorkspace(normalized.workspace, normalized.workspaceOverflow), normalized);
  assert.equal(Object.hasOwn(normalized.workspace, 'hideSiteChrome'), false);
  assert.equal(Object.hasOwn(normalized.workspace, 'sync'), false);
  assert.equal(normalizeWorkspace({ panes: [], sync: true }).workspace.panes.length, 0);
});

test('pin preferences survive normalization and archive restoration while old panels join sync', () => {
  const panes = Array.from({length:4},(_,index)=>({id:`pane-${index}`,url:'https://www.facebook.com/',enabled:true,pinned:index%2===1}));
  const result = normalizeWorkspace({panes,sync:true});
  assert.deepEqual(result.workspace.panes.map(pane=>pane.pinned),[false,true,false]);
  assert.equal(result.workspaceOverflow[0].pinned,true);
  assert.deepEqual(normalizeWorkspace(result.workspace,result.workspaceOverflow),result);
  assert.equal(normalizeWorkspace({panes:[{id:'old',url:panes[0].url,enabled:true}],sync:true}).workspace.panes[0].pinned,false);
  assert(!validPane({...panes[0],pinned:'yes'}));
});

test('viewport delta preserves independent offsets across different panel heights', () => {
  const delta = normalizedDelta(300, 500, 800);
  assert.equal(delta, 0.25);
  assert.equal(applyDelta(1000, delta, 600, 5000), 1150);
  assert.equal(applyDelta(40, -delta, 600, 5000), 0);
  assert.equal(applyDelta(4900, delta, 600, 5000), 5000);
  assert.equal(normalizedDelta(0, 20, 0), 0);
  assert.equal(applyDelta(500, delta, 600, 0), 0);
});
test('only HTTPS or explicit local HTTP without embedded credentials is accepted', () => {
  assert.equal(parseSite('https://x.com/home').pattern, 'https://x.com/*');
  assert.equal(parseSite('http://localhost:3456/feed').origin, 'http://localhost:3456');
  assert.throws(() => parseSite('http://x.com'));
  assert.throws(() => parseSite('https://me:secret@x.com'));
  assert.throws(() => parseSite('javascript:alert(1)'));
});
test('compatibility rule is confined to exact origin, workspace tab and subframes', () => {
  const rule = makeFrameRule(7, 13, 'http://localhost:3456/feed');
  assert.deepEqual(rule.condition.tabIds, [13]);
  assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
  assert.deepEqual(rule.condition.requestDomains, ['localhost']);
  const match = new RegExp(rule.condition.regexFilter);
  assert(match.test('http://localhost:3456/feed'));
  assert(!match.test('http://localhost:4567/feed'));
  assert(!match.test('http://localhost:3456.evil/feed'));
  assert.deepEqual(rule.action.responseHeaders.map(h => h.header), ['x-frame-options', 'content-security-policy']);
  assert.equal(rule.action.requestHeaders, undefined);
});
test('only scoped Facebook, Instagram and Threads frame rules set Sec-Fetch-Dest', () => {
  for (const host of ['facebook.com', 'www.facebook.com', 'instagram.com', 'www.instagram.com', 'threads.com', 'www.threads.com']) {
    const rule = makeFrameRule(8, 23, `https://${host}/`);
    assert.deepEqual(rule.action.requestHeaders, [{ header: 'sec-fetch-dest', operation: 'set', value: 'document' }]);
    assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
    assert.deepEqual(rule.condition.tabIds, [23]);
    assert(new RegExp(rule.condition.regexFilter).test(`https://${host}/login`));
    assert(!new RegExp(rule.condition.regexFilter).test('https://other.example/login'));
  }
  for (const url of ['https://x.com/', 'https://example.com/', 'https://notfacebook.com/', 'https://facebook.com.evil.test/', 'https://notthreads.com/', 'https://threads.com.evil.test/', 'http://localhost:3456/']) {
    assert.equal(makeFrameRule(9, 23, url).action.requestHeaders, undefined);
  }
});
test('protocol rejects stale session, repeated sequence and unbounded deltas', () => {
  const message = { type: 'scroll', session: 'session', sequence: 4, delta: -0.25 };
  assert(validScroll(message, 'session', 3));
  assert(!validScroll(message, 'other', 3));
  assert(!validScroll(message, 'session', 4));
  assert(!validScroll({ ...message, delta: NaN }, 'session'));
  assert(!validScroll({ ...message, delta: 100 }, 'session'));
  assert(!validScroll({ ...message, sequence: 2.4 }, 'session'));
  assert(validPane({ id: 'pane-1', url: 'https://x.com', enabled: false }));
  assert(!validPane({ id: 'pane:1', url: 'https://x.com', enabled: true }));
});

test('saved theme overrides migrate to native ownership without a global sync switch', () => {
  const panes=['site','dark','light'].map((theme,index)=>({id:'theme-'+index,url:'https://www.facebook.com/',enabled:true,theme}));
  const normalized=normalizeWorkspace({panes,sync:false});
  assert.deepEqual(normalized.workspace.panes.map(p=>p.theme),['site','site','site']);
  assert.equal(normalizeWorkspace({panes:[]},[{...panes[1],id:'archived-theme'}]).workspaceOverflow[0].theme,'site');
  assert.equal(Object.hasOwn(normalized.workspace,'sync'),false);
  assert(!validPane({...panes[0],theme:'invalid'}));
});

test('Reddit requests optional cookies with its exact origin; peers keep host-only grants', () => {
  assert.deepEqual(sitePermissions('https://www.reddit.com/r/test'), { origins: ['https://www.reddit.com/*', 'https://reddit.com/*'], permissions: ['cookies'] });
  for (const url of ['https://reddit.com/', 'https://www.reddit.com.example.org/', 'https://www.youtube.com/shorts/', 'https://www.facebook.com/']) {
    assert.deepEqual(sitePermissions(url), { origins: sitePermissionOrigins(url) });
  }
});

test('X requests only its exact host and optional cookies, and remains sync eligible', () => {
  assert.deepEqual(sitePermissions('https://x.com/home?lang='), { origins: ['https://x.com/*'], permissions: ['cookies'] });
  assert.equal(isIndependentSocial('https://x.com/home'), false);
  for (const url of ['https://api.x.com/', 'https://x.com.example.org/', 'https://www.x.com/']) {
    assert.deepEqual(sitePermissions(url), { origins: sitePermissionOrigins(url) });
  }
});

test('X document URLs bypass app-shell cache without changing existing language or route data', () => {
  assert.equal(siteFrameUrl('https://x.com/'), 'https://x.com/home?lang=');
  assert.equal(siteFrameUrl('https://x.com/home'), 'https://x.com/home?lang=');
  assert.equal(siteFrameUrl('https://x.com/person/status/123?ref=read#reply'), 'https://x.com/person/status/123?ref=read&lang=#reply');
  assert.equal(siteFrameUrl('https://x.com/home?lang=vi&ref=read#feed'), 'https://x.com/home?lang=vi&ref=read#feed');
  for (const url of ['https://api.x.com/home', 'https://x.com.example.org/home', 'https://www.facebook.com/']) assert.equal(siteFrameUrl(url), url);
  assert.equal(siteFrameUrl(siteFrameUrl('https://x.com/home')), siteFrameUrl('https://x.com/home'));
  assert.throws(() => siteFrameUrl('https://user:pass@x.com/'));
});

test('saved X panels and archives retain identity and preferences while gaining compatible document URLs', () => {
  const pane = { id: 'x', url: 'https://x.com/', enabled: true, pinned: true, theme: 'site' };
  const archive = { ...pane, id: 'archived', url: 'https://x.com/person/status/123?lang=vi' };
  const result = normalizeWorkspace({ panes: [pane] }, [archive]);
  assert.deepEqual(result.workspace.panes, [{ ...pane, url: 'https://x.com/home?lang=' }]);
  assert.deepEqual(result.workspaceOverflow, [archive]);
  assert.deepEqual(normalizeWorkspace(result.workspace, result.workspaceOverflow), result);
});
