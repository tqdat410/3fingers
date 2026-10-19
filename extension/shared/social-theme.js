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
  const supportedHost = ['www.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tiktok.com', 'www.reddit.com', 'www.youtube.com', 'x.com'].includes(location.hostname);
  if (!supportedHost || top === window || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return { supported: false };
  const root = document.documentElement;
  if (mode === 'site' && window.__threeFingersNativeThemeUnsupported === true) return { supported: false, native: true };
  const waitFor = read => new Promise(resolve => {
    const current = read();
    if (current) { resolve(current); return; }
    const observer = new MutationObserver(() => { const value = read(); if (value) finish(value); });
    const timer = setTimeout(() => finish(null), 3000);
    function finish(value) { clearTimeout(timer); observer.disconnect(); resolve(value); }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'dark', 'checked', 'aria-checked', 'aria-selected', 'aria-expanded', 'data-theme', 'data-tux-color-scheme', 'aria-pressed', 'hidden'] });
  });
  const host = location.hostname;
  const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
    && !element.closest('[hidden],[aria-hidden="true"],[inert]');
  const readMode = () => host === 'www.youtube.com' ? (root.hasAttribute('dark') ? 'dark' : 'light')
    : host === 'www.reddit.com' ? (root.classList.contains('theme-dark') || !root.classList.contains('theme-light') && getComputedStyle(root).colorScheme === 'dark' ? 'dark' : 'light')
    : root.classList.contains('__fb-dark-mode') || root.classList.contains('_aa4d') ? 'dark' : 'light';
  const nativeResult = supported => {
    window.__threeFingersNativeThemeUnsupported = !supported;
    return { supported, mode: readMode(), native: true };
  };
  const escapeMenu = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true }));
  const textControl = (pattern, scope = document) => [...scope.querySelectorAll('button,[role="button"],[role="menuitem"]')]
    .find(element => visible(element) && pattern.test(element.innerText.trim().replace(/\s+/g, ' ')));
  if (host === 'www.youtube.com') {
    const avatar = await waitFor(() => document.querySelector('ytd-app #avatar-btn'));
    if (!avatar) return nativeResult(false);
    if (mode === 'site') return nativeResult(true);
    const menus = () => [...document.querySelectorAll('ytd-multi-page-menu-renderer')].filter(visible);
    const themeChoices = () => {
      const labels = [/^(use device theme|dùng giao diện thiết bị)$/i, /^(dark theme|giao diện tối)$/i, /^(light theme|giao diện sáng)$/i];
      const groups = menus().map(menu => [...menu.querySelectorAll('ytd-compact-link-renderer')].filter(visible))
        .filter(items => items.length === 3 && items.every((item, index) => labels[index].test((item.querySelector('#label')?.textContent || item.innerText).trim().replace(/\s+/g, ' '))));
      const unique = groups.filter((items, index) => groups.findIndex(other => other[0] === items[0]) === index);
      return unique.length === 1 ? unique[0] : null;
    };
    const opened = menus().length === 0;
    window.__threeFingersNativeThemeBusy = true;
    try {
      if (opened) avatar.click();
      if (!themeChoices()) {
        const appearance = await waitFor(() => [...document.querySelectorAll('ytd-toggle-theme-compact-link-renderer')].find(visible));
        if (appearance) appearance.dispatchEvent(new CustomEvent('tap', { bubbles: true, composed: true }));
      }
      const choices = await waitFor(themeChoices);
      if (!choices) return nativeResult(false);
      // YouTube's native menu order is Device, Dark, Light.
      choices[mode === 'dark' ? 1 : 2].dispatchEvent(new CustomEvent('tap', { bubbles: true, composed: true }));
      return nativeResult(Boolean(await waitFor(() => readMode() === mode)));
    } finally {
      if (opened) {
        for (const menu of menus()) {
          const dropdown = menu.closest('tp-yt-iron-dropdown');
          if (typeof dropdown?.close === 'function') dropdown.close();
        }
        escapeMenu();
      }
      window.__threeFingersNativeThemeBusy = false;
    }
  }
  if (host === 'www.reddit.com') {
    const drawer = await waitFor(() => document.querySelector('#expand-user-drawer-button'));
    if (!drawer) return nativeResult(false);
    if (mode === 'site') return nativeResult(true);
    const option = () => [...document.querySelectorAll(`[data-testid="theme-option-${mode === 'dark' ? 2 : 1}"] [role="option"]`)].find(visible);
    const opened = !option();
    const drawerOpened = opened && drawer.getAttribute('aria-expanded') !== 'true';
    window.__threeFingersNativeThemeBusy = true;
    try {
      if (drawerOpened) drawer.click();
      if (opened) {
        const entry = await waitFor(() => [...document.querySelectorAll('#darkmode-list-item [tabindex]')].find(visible));
        if (!entry) return nativeResult(false);
        entry.click();
      }
      const choice = await waitFor(option);
      if (!choice) return nativeResult(false);
      choice.click();
      return nativeResult(Boolean(await waitFor(() => readMode() === mode)));
    } finally {
      if (opened && option()) escapeMenu();
      if (drawerOpened && drawer.getAttribute('aria-expanded') === 'true') drawer.click();
      window.__threeFingersNativeThemeBusy = false;
    }
  }
  if (['www.facebook.com', 'www.instagram.com', 'www.threads.com'].includes(host)) {
    const facebook = host === 'www.facebook.com';
    const findTrigger = () => {
      if (facebook) return [...document.querySelectorAll('[role="button"][aria-label]')].find(element => /^(your profile|trang cá nhân của bạn)$/i.test(element.getAttribute('aria-label')));
      const candidates = [...document.querySelectorAll('svg[aria-label]')]
        .filter(element => visible(element) && /^(settings|more|menu|cài đặt|thêm)$/i.test(element.getAttribute('aria-label')))
        .map(element => element.closest('button,[role="button"],a')).filter(Boolean);
      const navigation = candidates.filter(element => element.closest('nav,[role="navigation"]'));
      const unique = [...new Set(navigation.length ? navigation : candidates)];
      return unique.length === 1 ? unique[0] : null;
    };
    const trigger = findTrigger() || (document.readyState !== 'complete' ? await waitFor(findTrigger) : null);
    if (!trigger) return nativeResult(false);
    if (mode === 'site') return nativeResult(true);
    const displayPattern = /^(display (&|and) accessibility|màn hình và trợ năng|appearance|giao diện|switch appearance|chuyển giao diện)$/i;
    const menus = () => [...document.querySelectorAll('[role="menu"],[role="dialog"]')].filter(visible);
    const displayControl = () => menus().map(menu => textControl(displayPattern, menu)).find(Boolean);
    let appearanceOpened = menus().some(menu => [...menu.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .some(element => /^(appearance|giao diện|switch appearance|chuyển giao diện)$/i.test(element.innerText.trim())));
    const radio = () => facebook ? [...document.querySelectorAll(`input[name="dark-mode"][value="${mode === 'dark' ? 'ENABLED' : 'DISABLED'}"]`)].find(element => visible(element.closest('label') || element))
      : appearanceOpened ? menus().map(menu => [...menu.querySelectorAll('[role="switch"]')].filter(visible).find(element => /dark|tối/i.test(element.getAttribute('aria-label') || element.innerText))
        || textControl(mode === 'dark' ? /^(dark|tối|chế độ tối)$/i : /^(light|sáng|chế độ sáng)$/i, menu)).find(Boolean) : null;
    const opened = !radio() && !displayControl();
    window.__threeFingersNativeThemeBusy = true;
    try {
      if (opened) trigger.click();
      if (!radio()) {
        const display = await waitFor(displayControl);
        if (!display) return nativeResult(false);
        display.click();
        appearanceOpened = true;
      }
      const choice = await waitFor(radio);
      if (!choice) return nativeResult(false);
      if (choice.getAttribute('role') !== 'switch' || choice.getAttribute('aria-checked') !== String(mode === 'dark')) choice.click();
      return nativeResult(Boolean(await waitFor(() => readMode() === mode)));
    } finally {
      if (opened) escapeMenu();
      window.__threeFingersNativeThemeBusy = false;
    }
  }
  if (location.hostname === 'x.com') {
    const available = await waitFor(() => ['light', 'dark'].includes(root.getAttribute('data-theme'))
      && document.querySelector('#react-root [data-testid="AppTabBar_More_Menu"],input[name="background-picker"]'));
    if (!available) return { supported: false };
    window.__threeFingersNativeThemeUnsupported = false;
    if (mode === 'site' || root.getAttribute('data-theme') === mode) return { supported: true, mode: root.getAttribute('data-theme'), native: true };
    const original = { url: location.href, state: history.state, top: scrollY };
    const opened = location.pathname !== '/i/display';
    const navigate = (url, state) => {
      // Replace only this frame's route; joint-history Back can rewind peers.
      history.replaceState(state, '', url);
      dispatchEvent(new PopStateEvent('popstate', { state }));
    };
    window.__threeFingersNativeThemeBusy = true;
    try {
      if (opened) navigate('/i/display' + location.search, original.state);
      const radios = await waitFor(() => {
        const choices = document.querySelectorAll('input[name="background-picker"]');
        return choices.length === 2 ? choices : null;
      });
      if (!radios || location.pathname !== '/i/display') return { supported: false };
      // Native order is Light, Lights out; do not depend on translated labels.
      radios[mode === 'dark' ? 1 : 0].click();
      const applied = await waitFor(() => root.getAttribute('data-theme') === mode);
      return { supported: Boolean(applied), mode: root.getAttribute('data-theme'), native: true };
    } finally {
      try {
        if (opened && location.pathname === '/i/display') {
          navigate(original.url, original.state);
          await waitFor(() => !document.querySelector('input[name="background-picker"]'));
          scrollTo({ top: original.top, behavior: 'instant' });
        }
      } finally { window.__threeFingersNativeThemeBusy = false; }
    }
  }
  if (location.hostname === 'www.tiktok.com') {
    window.__threeFingersNativeThemeBusy = true;
    try {
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
  return { supported: false };
}
