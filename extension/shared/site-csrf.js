export const csrfSites = {
  'https://www.reddit.com': { name: 'csrf_token', domains: ['reddit.com', '.reddit.com', 'www.reddit.com', '.www.reddit.com'] },
  'https://x.com': { name: 'ct0', domains: ['x.com', '.x.com'] },
};

// Executed only in a registered direct document. Values live in this
// document's closure, never extension storage or DOM attributes.
export function installSiteCsrf(value, workspaceOrigin, expires = 0) {
  // Keep the serialized MAIN-world function self-contained and allowlisted.
  const name = { 'https://www.reddit.com': 'csrf_token', 'https://x.com': 'ct0' }[location.origin];
  if (!name || window === top || !/^chrome-extension:\/\/[a-p]{32}$/.test(workspaceOrigin)
    || window.parent !== window.top || !location.ancestorOrigins
    || location.ancestorOrigins.length !== 1 || location.ancestorOrigins[0] !== workspaceOrigin) return false;
  const key = Symbol.for('3fingers.site-csrf');
  const existing = document[key];
  if (value === null) {
    existing?.remove();
    return true;
  }
  if (typeof value !== 'string') return false;
  if (existing) { existing.update(value, expires); return true; }
  const own = Object.getOwnPropertyDescriptor(document, 'cookie');
  // Do not overwrite another accessor installed by the site or an extension.
  if (own) return false;
  const native = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!native?.get || !native.set) return false;
  let token = value;
  const prefix = name + '=';
  const get = function () {
    const cookies = native.get.call(this);
    if (this !== document || !token || (expires && Date.now() >= expires * 1000)
      || cookies.split(';').some(part => part.trim().startsWith(prefix) && part.trim().length > prefix.length)) return cookies;
    const other = cookies.split(';').filter(part => !part.trim().startsWith(prefix)).filter(Boolean).join(';');
    return `${other}${other ? '; ' : ''}${prefix}${token}`;
  };
  const set = function (text) { native.set.call(this, text); };
  Object.defineProperty(document, 'cookie', { configurable: true, enumerable: native.enumerable, get, set });
  Object.defineProperty(document, key, { configurable: true, value: {
    update(next, expiry) { token = next; expires = expiry; },
    remove() {
      token = '';
      const current = Object.getOwnPropertyDescriptor(document, 'cookie');
      if (current?.get === get && current?.set === set) delete document.cookie;
      delete document[key];
    },
  } });
  return true;
}
