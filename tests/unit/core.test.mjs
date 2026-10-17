import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedDelta, applyDelta, parseSite, makeFrameRule, validScroll, validPane, normalizeWorkspace } from '../../extension/shared/core.js';

test('upgrade preserves custom URLs and overflow while dropping retired settings', () => {
  const panes = ['facebook.com', 'example.org', 'instagram.com', 'threads.com']
    .map((host, index) => ({ id: `pane-${index}`, url: `https://${host}/`, enabled: true, weight: index + 1 }));
  const normalized = normalizeWorkspace({ panes, sync: false, hideSiteChrome: true }, [panes[3]]);
  assert.deepEqual(normalized.workspace.panes, panes.slice(0, 3).map(({ weight, ...pane }) => pane));
  assert.deepEqual(normalized.workspaceOverflow, [((({ weight, ...pane }) => pane)(panes[3]))]);
  assert.deepEqual(normalizeWorkspace(normalized.workspace, normalized.workspaceOverflow), normalized);
  assert.equal(Object.hasOwn(normalized.workspace, 'hideSiteChrome'), false);
  assert.equal(normalized.workspace.sync, false);
  assert.equal(normalizeWorkspace({ panes: [], sync: true }).workspace.panes.length, 0);
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
