// Serialized by chrome.scripting: keep this function self-contained.
export function installTikTokThemeCookies(extensionOrigin) {
  if (location.hostname !== 'www.tiktok.com' || top === window || location.ancestorOrigins.length !== 1
    || location.ancestorOrigins[0] !== extensionOrigin || !/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin)
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return false;
  const existing = Object.getOwnPropertyDescriptor(document, 'cookie');
  if (existing) return existing.set === window.__threeFingersThemeCookieBridge;
  const native = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!native?.get || !native?.set) return false;
  // Only native visual preferences need cross-site compatibility in this document.
  const names = ['tiktok_webapp_theme', 'tiktok_webapp_theme_source', 'tiktok_webapp_theme_manual'];
  const setter = function (value) {
    const separator = typeof value === 'string' ? value.indexOf('=') : -1;
    if (separator > 0 && names.includes(value.slice(0, separator).trim()) && !/;\s*samesite\s*=/i.test(value)) {
      value += '; SameSite=None' + (/;\s*secure\s*(?:;|$)/i.test(value) ? '' : '; Secure');
    }
    native.set.call(this, value);
  };
  Object.defineProperty(document, 'cookie', { configurable: true, enumerable: native.enumerable, get: native.get, set: setter });
  window.__threeFingersThemeCookieBridge = setter;
  return true;
}

// Serialized by chrome.scripting: keep this function self-contained.
export async function applySocialTheme(mode = 'site') {
  if (!['site', 'light', 'dark'].includes(mode)) throw new Error('Invalid theme.');
  const supportedHost = ['www.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tiktok.com'].includes(location.hostname);
  if (!supportedHost || top === window || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return { supported: false };
  const root = document.documentElement;
  if (location.hostname === 'www.tiktok.com') {
    window.__threeFingersNativeThemeBusy = true;
    try {
      // Retire the earlier root override before using the site's own controls.
      const previous = window.__threeFingersTikTokTheme;
      if (previous) {
        previous.observer.disconnect();
        if (previous.frame) cancelAnimationFrame(previous.frame);
        for (const [name, value] of previous.original) root.setAttribute(name, value);
        delete window.__threeFingersTikTokTheme;
      }
      const waitFor = read => new Promise(resolve => {
        const current = read();
        if (current) { resolve(current); return; }
        const observer = new MutationObserver(() => { const value = read(); if (value) finish(value); });
        const timer = setTimeout(() => finish(null), 3000);
        function finish(value) { clearTimeout(timer); observer.disconnect(); resolve(value); }
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme', 'data-tux-color-scheme', 'aria-pressed', 'hidden'] });
      });
      const more = await waitFor(() => ['light', 'dark'].includes(root.getAttribute('data-tux-color-scheme'))
        ? document.querySelector('[data-e2e="nav-more-menu"]') : null);
      if (!more) { window.__threeFingersNativeThemeUnsupported = true; return { supported: false }; }
      const opened = more.getAttribute('aria-pressed') !== 'true';
      const concealment = opened ? document.createElement('style') : null;
      try {
        if (opened) {
          // Keep native controls mounted and clickable without showing the drawer.
          concealment.textContent = '[data-key-interaction="side_nav"] [class*="DivDrawerContainer"]{visibility:hidden!important;pointer-events:none!important}';
          root.append(concealment);
          more.click();
          if (!await waitFor(() => more.getAttribute('aria-pressed') === 'true')) {
            window.__threeFingersNativeThemeUnsupported = true;
            return { supported: false };
          }
        }
        const group = await waitFor(() => {
          const groups = [...document.querySelectorAll('[data-testid="tux-segmented-control"]')]
            .filter(node => node.getClientRects().length && !node.closest('[aria-hidden="true"]')
              && node.querySelectorAll('[data-testid="tux-segment-item"]').length === 3);
          return groups.length === 1 ? groups[0] : null;
        });
        if (!group) { window.__threeFingersNativeThemeUnsupported = true; return { supported: false }; }
        if (mode !== 'site') {
          // Native order: Device, Dark, Light. Test IDs avoid translated labels.
          group.querySelectorAll('[data-testid="tux-segment-item"]')[mode === 'dark' ? 1 : 2].click();
          const applied = await waitFor(() => root.getAttribute('data-theme') === mode && root.getAttribute('data-tux-color-scheme') === mode);
          if (!applied) { window.__threeFingersNativeThemeUnsupported = true; return { supported: false }; }
          await Promise.resolve();
        }
      } finally {
        try {
          if (opened && more.getAttribute('aria-pressed') === 'true') {
            const close = more.closest('[data-key-interaction="side_nav"]')?.querySelector('button[class*="StyledTUXMoreCloseButton"]');
            close?.click();
            await waitFor(() => more.getAttribute('aria-pressed') !== 'true');
          }
          if (concealment) await waitFor(() => {
            const drawer = more.closest('[data-key-interaction="side_nav"]')?.querySelector('[class*="DivDrawerContainer"]');
            return !drawer || !drawer.getClientRects().length;
          });
        } finally {
          concealment?.remove();
        }
      }
      const actual = root.getAttribute('data-tux-color-scheme');
      const supported = ['light', 'dark'].includes(actual) && (mode === 'site' || actual === mode);
      window.__threeFingersNativeThemeUnsupported = !supported;
      return { supported, mode: actual, native: true };
    } finally { window.__threeFingersNativeThemeBusy = false; }
  }
  const pairs = [['__fb-light-mode', '__fb-dark-mode']];
  if (location.hostname === 'www.instagram.com') pairs.push(['_aa4c', '_aa4d']);
  const activePairs = pairs.filter(pair => pair.some(name => root.classList.contains(name)));
  let controller = window.__threeFingersTheme;
  if (!activePairs.length && !controller) return { supported: false };
  if (mode === 'site' && controller) {
    controller.observer.disconnect();
    for (const [name, present] of controller.originalClasses) root.classList.toggle(name, present);
    if (controller.originalScheme) root.style.setProperty('color-scheme', controller.originalScheme, controller.originalPriority);
    else root.style.removeProperty('color-scheme');
    delete window.__threeFingersTheme;
  } else if (mode !== 'site') {
    if (!controller) {
      controller = { pairs: activePairs, originalClasses: activePairs.flat().map(name => [name, root.classList.contains(name)]),
        originalScheme: root.style.getPropertyValue('color-scheme'), originalPriority: root.style.getPropertyPriority('color-scheme') };
      controller.apply = () => {
        for (const [light, dark] of controller.pairs) {
          root.classList.toggle(light, controller.mode === 'light');
          root.classList.toggle(dark, controller.mode === 'dark');
        }
        root.style.setProperty('color-scheme', controller.mode);
      };
      controller.observer = new MutationObserver(() => {
        if (controller.pairs.some(([light, dark]) => root.classList.contains(light) !== (controller.mode === 'light')
          || root.classList.contains(dark) !== (controller.mode === 'dark'))) controller.apply();
      });
      controller.observer.observe(root, { attributes: true, attributeFilter: ['class'] });
      window.__threeFingersTheme = controller;
    }
    controller.mode = mode;
    controller.apply();
  }
  return { supported: true, mode: root.classList.contains('__fb-dark-mode') || root.classList.contains('_aa4d') ? 'dark' : 'light' };
}
