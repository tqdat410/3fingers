import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedDelta, applyDelta, parseSite, sitePermissionOrigins, makeFrameRule, validScroll, validPane, normalizeWorkspace, isIndependentSocial } from '../../extension/shared/core.js';

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

test('theme preferences migrate without a global sync switch', () => {
  const panes=['site','dark','light'].map((theme,index)=>({id:'theme-'+index,url:'https://www.facebook.com/',enabled:true,theme}));
  const normalized=normalizeWorkspace({panes,sync:false});
  assert.deepEqual(normalized.workspace.panes.map(p=>p.theme),['site','dark','light']);
  assert.equal(Object.hasOwn(normalized.workspace,'sync'),false);
  assert(!validPane({...panes[0],theme:'invalid'}));
});
