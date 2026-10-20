// UI-only localization. Worker messages remain stable English protocol values.
export function resolveLocale(preference = 'auto', uiLanguage = 'en') {
  return preference === 'vi' || (preference !== 'en' && /^vi(?:-|$)/i.test(uiLanguage)) ? 'vi' : 'en';
}
export function formatMessage(message, substitutions = []) {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return message.replace(/\$(\d+)/g, (token, index) => values[Number(index) - 1] ?? token);
}
let catalogs = {}, preference = 'auto', locale = 'en';
const bindings = new WeakMap(), listeners = new Set();
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchMessage(message, catalog) {
  for (const [key, entry] of Object.entries(catalog)) {
    if (!entry.message.includes('$') && message === entry.message) return { key, values: [] };
  }
  const templates = Object.entries(catalog).sort((a, b) => b[1].message.replace(/\$\d+/g, '').length - a[1].message.replace(/\$\d+/g, '').length);
  for (const [key, entry] of templates) {
    if (!/\$\d+/.test(entry.message)) continue;
    const pattern = entry.message.split(/(\$\d+)/).map(part => /^\$\d+$/.test(part) ? '(.+?)' : escapeRegex(part)).join('');
    const match = message.match(new RegExp('^' + pattern + '$'));
    if (match) return { key, values: match.slice(1) };
  }
  return null;
}
export function translateMessage(message) {
  message = String(message ?? '');
  const match = matchMessage(message, catalogs.en || {}) || matchMessage(message, catalogs.vi || {});
  return match ? t(match.key, match.values) : message;
}
export function t(key, values = []) {
  return formatMessage(catalogs[locale]?.[key]?.message || catalogs.en?.[key]?.message || key, values);
}
function bind(node, attribute, source) {
  if (!bindings.has(node)) bindings.set(node, new Map());
  bindings.get(node).set(attribute, String(source ?? ''));
  const value = translateMessage(source);
  if (attribute === 'textContent') node.textContent = value;
  else node.setAttribute(attribute, value);
}
export function bindText(node, source) { bind(node, 'textContent', source); }
export function bindAttribute(node, attribute, source) {
  // A tooltip is also used as the accessible label by existing controls.
  if (attribute === 'aria-label' && source === node.title) source = bindings.get(node)?.get('title') ?? source;
  bind(node, attribute, source);
}
export function sourceText(node) { return bindings.get(node)?.get('textContent') ?? node.textContent; }
export function localizeTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = root;
  do {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && !['SCRIPT','STYLE','OPTION'].includes(node.parentElement?.tagName)) {
      const raw = node.textContent, text = raw.trim();
      if (matchMessage(text, catalogs.en)) bindText(node, text);
    }
    if (node.nodeType === Node.ELEMENT_NODE) for (const attribute of ['title','aria-label']) {
      if (node.hasAttribute(attribute)) bindAttribute(node, attribute, node.getAttribute(attribute));
    }
  } while ((node = walker.nextNode()));
}
export const getLanguage = () => preference;
export const onLocaleChange = callback => { listeners.add(callback); return () => listeners.delete(callback); };
function applyLanguage(value) {
  preference = ['en','vi'].includes(value) ? value : 'auto';
  locale = resolveLocale(preference, chrome.i18n.getUILanguage());
  document.documentElement.lang = locale;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const nodes = [document.body];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) for (const [attribute, source] of bindings.get(node) || []) bind(node, attribute, source);
  const select = document.querySelector('#language');
  if (select) { select.value = preference; select.options[0].textContent = t('automatic'); }
  for (const listener of listeners) listener(locale);
}
export async function setLanguage(value) {
  await chrome.storage.local.set({ language: ['en','vi'].includes(value) ? value : 'auto' });
  applyLanguage(value);
}
if (typeof document !== 'undefined' && globalThis.chrome?.runtime?.getURL) {
  const [en, vi, saved] = await Promise.all([
    fetch(chrome.runtime.getURL('_locales/en/messages.json')).then(response => response.json()),
    fetch(chrome.runtime.getURL('_locales/vi/messages.json')).then(response => response.json()),
    chrome.storage.local.get('language'),
  ]);
  catalogs = { en, vi }; locale = resolveLocale(saved.language, chrome.i18n.getUILanguage());
  localizeTree(document.body); applyLanguage(saved.language);
  document.querySelector('#language')?.addEventListener('change', event => {
    setLanguage(event.target.value).catch(error => { const status = document.querySelector('#popup-status'); if (status) bindText(status, error.message); });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.language) applyLanguage(changes.language.newValue);
  });
}
