import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveLocale, formatMessage, matchMessage } from '../../extension/shared/i18n.js';
const en = JSON.parse(await readFile(new URL('../../extension/_locales/en/messages.json', import.meta.url)));
const vi = JSON.parse(await readFile(new URL('../../extension/_locales/vi/messages.json', import.meta.url)));
test('catalogs have identical keys and substitution contracts', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(vi).sort());
  for (const key of Object.keys(en)) {
    assert(vi[key].message.trim(), key);
    assert.deepEqual(en[key].message.match(/\$\d+/g), vi[key].message.match(/\$\d+/g), key);
  }
});
test('Auto uses Chrome UI Vietnamese only and manual choices override', () => {
  for (const ui of ['vi','vi-VN','VI-vn']) assert.equal(resolveLocale('auto', ui), 'vi');
  for (const ui of ['en','fr','invalid','vietnamese']) assert.equal(resolveLocale('auto', ui), 'en');
  assert.equal(resolveLocale('en','vi'), 'en'); assert.equal(resolveLocale('vi','en'), 'vi');
  assert.equal(resolveLocale('invalid','vi-VN'), 'vi');
});
test('interpolation retains literal replacement values and supports repeated parameters', () => {
  assert.equal(formatMessage('$1 / $2 / $1', ['$&','$1']), '$& / $1 / $&');
  assert.equal(formatMessage('$1 $2', ['x']), 'x $2');
});
test('stable worker errors and dynamic labels map without replacing unrelated text', () => {
  assert.equal(matchMessage('Site access denied.', en).key, 'siteAccessDenied');
  assert.equal(matchMessage('X needs narrow site access. Remove api.x.com or broader access in extension settings, then Open again.', en).key, 'narrowXAccess');
  assert.deepEqual(matchMessage('Facebook at position 2. Drop to save. Escape to cancel.', en), {key:'dropPosition',values:['Facebook','2']});
  assert.equal(matchMessage('Unknown browser error', en), null);
  assert.equal(matchMessage('Multitask is not real!', en), null);
});

test('message matching prefers literal text over broad templates and specific templates over short ones', () => {
  const catalog = { back:{message:'Back $1'}, exact:{message:'Back X'}, detail:{message:'Back: $1 ($2)'}, short:{message:'Back: $1'} };
  assert.deepEqual(matchMessage('Back X', catalog), {key:'exact',values:[]});
  assert.deepEqual(matchMessage('Back: X (2)', catalog), {key:'detail',values:['X','2']});
});
