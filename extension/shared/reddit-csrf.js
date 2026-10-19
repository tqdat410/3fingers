// Executed only in a registered direct Reddit document. Values live in this
// document's closure, never extension storage or DOM attributes.
export function installRedditCsrf(value, workspaceOrigin, expires = 0) {
  if (location.origin !== 'https://www.reddit.com' || window === top
    || window.parent !== window.top || !location.ancestorOrigins
    || location.ancestorOrigins.length !== 1 || location.ancestorOrigins[0] !== workspaceOrigin) return false;
  const key = Symbol.for('3fingers.reddit-csrf');
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
  const get = function () {
    const cookies = native.get.call(this);
    if (this !== document || !token || (expires && Date.now() >= expires * 1000)
      || /(?:^|;\s*)csrf_token=[^;]+/.test(cookies)) return cookies;
    const other = cookies.split(';').filter(part => !/^\s*csrf_token=/.test(part)).filter(Boolean).join(';');
    return `${other}${other ? '; ' : ''}csrf_token=${token}`;
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
