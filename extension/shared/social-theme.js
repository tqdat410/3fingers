// Serialized by chrome.scripting: keep this function self-contained.
export async function applySocialTheme(mode = 'site') {
  if (!['site', 'light', 'dark'].includes(mode)) throw new Error('Invalid theme.');
  if (location.hostname !== 'www.facebook.com' || top === window || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return { supported: false, native: true };
  const unavailable = () => {
    window.__threeFingersNativeThemeUnsupported = true;
    return { supported: false, native: true };
  };
  if (window.__threeFingersNativeThemeUnsupported === true) return unavailable();
  const findSettings = () => {
    try {
      const settings = typeof window.require === 'function' ? window.require('CometDarkMode') : null;
      return typeof settings?.saveDarkModeSetting === 'function' && typeof settings?.getDarkModeSetting === 'function' ? settings : null;
    } catch { return null; }
  };
  const deadline = Date.now() + 3000;
  let settings = findSettings();
  while (!settings && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    settings = findSettings();
  }
  if (!settings) return unavailable();
  const root = document.documentElement;
  const readMode = () => root.classList.contains('__fb-dark-mode') ? 'dark' : 'light';
  if (mode === 'site' || readMode() === mode) return { supported: true, mode: readMode(), native: true };
  // Use Facebook's preference mutation, including its optimistic update and rollback.
  try { settings.saveDarkModeSetting(mode === 'dark' ? 'ENABLED' : 'DISABLED', { onRevert() {} }); } catch { return unavailable(); }
  const applied = readMode() === mode || await new Promise(resolve => {
    const observer = new MutationObserver(() => { if (readMode() === mode) finish(true); });
    const timer = setTimeout(() => finish(false), 2000);
    function finish(value) { clearTimeout(timer); observer.disconnect(); resolve(value); }
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  });
  return applied ? { supported: true, mode: readMode(), native: true } : unavailable();
}
