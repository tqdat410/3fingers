// Serialized by chrome.scripting: keep this function self-contained.
export async function applySocialTheme(mode = 'site') {
  if (!['site', 'light', 'dark'].includes(mode)) throw new Error('Invalid theme.');
  const host = location.hostname;
  if (!['www.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tiktok.com', 'www.reddit.com', 'www.youtube.com', 'x.com'].includes(host) || top === window || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return { supported: false, native: true };
  const unavailable = () => ({ supported: false, native: true });
  const root = document.documentElement;
  const readMode = () => ['x.com', 'www.tiktok.com'].includes(host) ? (root.dataset.theme === 'dark' ? 'dark' : 'light') : host === 'www.youtube.com' ? (root.hasAttribute('dark') ? 'dark' : 'light') : host === 'www.reddit.com'
    ? (root.classList.contains('theme-dark') || !root.classList.contains('theme-light') && getComputedStyle(root).colorScheme === 'dark' ? 'dark' : 'light')
    : root.classList.contains('__fb-dark-mode') ? 'dark'
    : root.classList.contains('__fb-light-mode') ? 'light' : root.classList.contains('_aa4d') ? 'dark' : 'light';
  const findProvider = (context, accepts, identity = value => value) => {
    const roots = new Set();
    for (const node of [document.body, ...document.querySelectorAll('body > div,div[id^="mount_"]')]) {
      if (!node) continue;
      for (const key of Object.keys(node)) {
        if (!key.startsWith('__reactContainer$') && !key.startsWith('__reactFiber$')) continue;
        const fiber = node[key];
        roots.add(fiber?.current || fiber?.stateNode?.current || fiber);
      }
    }
    const pending = [...roots], seen = new Set(), values = new Map();
    while (pending.length && seen.size < 20000) {
      const fiber = pending.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      if (!context || fiber.type === context || fiber.type?._context === context) {
        const value = fiber.memoizedProps?.value;
        if (accepts(value)) values.set(identity(value), value);
      }
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
    return values.size === 1 ? [...values.values()][0] : null;
  };
  let xModules, tiktokRuntime;
  if (host === 'x.com' && Array.isArray(window.webpackChunk_twitter_responsive_web)) {
    // Capture only the loaded native cache; never execute unknown module factories.
    window.webpackChunk_twitter_responsive_web.push([[`3fingers-theme-${crypto.randomUUID()}`], {}, runtime => { xModules = runtime.c; }]);
  }
  if (host === 'www.tiktok.com' && Array.isArray(window.__LOADABLE_LOADED_CHUNKS__)) {
    window.__LOADABLE_LOADED_CHUNKS__.push([[`3fingers-theme-${crypto.randomUUID()}`], {}, runtime => { tiktokRuntime = runtime; }]);
  }
  const findSettings = () => {
    try {
      if (host === 'www.tiktok.com') {
        const value = findProvider(null, value => typeof value?.setCurrentThemeOption === 'function'
          && typeof value.toggle === 'function' && typeof value.value === 'boolean'
          && ['light', 'dark', 'auto', 'system'].includes(value.currentThemeOption));
        if (!value) return null;
        // Follow the mounted provider's cookie import, not another bundled copy.
        const setterSource = Function.prototype.toString.call(value.setCurrentThemeOption);
        const alias = setterSource.match(/([\w$]+)\.A\.set\(/)?.[1];
        if (!alias) return null;
        const imports = new Set();
        const escapedAlias = alias.replace(/\$/g, '\\$');
        for (const factory of Object.values(tiktokRuntime?.m || {})) {
          const source = Function.prototype.toString.call(factory);
          if (!source.includes(setterSource) || !source.includes('setCurrentThemeOption:')) continue;
          const id = source.match(new RegExp(`\\b${escapedAlias}=\\w+\\((\\d+)\\)`))?.[1];
          if (id) imports.add(id);
        }
        if (imports.size !== 1) return null;
        const id = [...imports][0], factory = tiktokRuntime.m[id], source = Function.prototype.toString.call(factory);
        if (factory.length !== 2 || !['document.cookie', 'withAttributes:', 'withConverter:', 'attributes:{value:Object.freeze'].every(part => source.includes(part))) return null;
        const cookies = tiktokRuntime(id)?.A;
        if (typeof cookies?.set !== 'function' || typeof cookies.get !== 'function') return null;
        return { currentMode: value.currentThemeOption, applied(mode) {
          return cookies.get('tiktok_webapp_theme_source') === mode && cookies.get('tiktok_webapp_theme') === mode
            && root.dataset.tuxColorScheme === mode;
        }, apply(mode) {
          // This is the app's explicit-selection sequence, including its manual flag.
          cookies.set('tiktok_webapp_theme_manual', '1');
          value.setCurrentThemeOption(mode);
        } };
      }
      if (host === 'x.com') {
        const modules = Object.values(xModules || {}).map(module => module.exports);
        const engines = [], preferences = [], actions = [];
        for (const module of modules) {
          try {
            if (typeof module?.A?.setPalette === 'function' && typeof module.A.setTheme === 'function'
              && ['light', 'dark'].includes(module.A.theme?.paletteName)) engines.push(module.A);
            if (typeof module?.hZ === 'function' && typeof module.Jt === 'function' && typeof module.IU === 'function'
              && module.LH?.default === 'light' && module.LH.dark === 'dark'
              && Function.prototype.toString.call(module.hZ).includes('cookieOptions')) preferences.push(module);
            if (typeof module?.Xx === 'function' && typeof module.BC === 'function'
              && /local:.*remote:/.test(Function.prototype.toString.call(module.Xx))) actions.push(module.Xx);
          } catch { /* Other native modules can export cross-origin Window objects. */ }
        }
        const context = findProvider(null, value => typeof value?.featureSwitches?.isTrue === 'function'
          && typeof value?.store?.dispatch === 'function' && value.history && value.scrollManager, value => value.store);
        if (engines.length !== 1 || preferences.length !== 1 || actions.length !== 1 || !context) return null;
        return { apply(mode) {
          engines[0].setPalette(mode);
          context.store.dispatch(actions[0]({ themeBackground: mode }));
          preferences[0].hZ(mode, context.featureSwitches);
          if (preferences[0].Jt(context.featureSwitches) !== mode) throw new Error('Native preference was not saved.');
        } };
      }
      if (host === 'www.youtube.com') {
        const app = document.querySelector('ytd-app');
        if (typeof app?.onThemeSelected !== 'function' || typeof app?.getCurrentTheme !== 'function') return null;
        return { apply(mode) {
          app.onThemeSelected(mode === 'dark', mode === 'light');
          const preference = mode === 'dark' ? 'USER_INTERFACE_THEME_DARK' : 'USER_INTERFACE_THEME_LIGHT';
          if (app.getCurrentTheme() !== preference) throw new Error('Native preference was not saved.');
          return { reloadRequired: readMode() !== mode };
        } };
      }
      if (host === 'www.reddit.com') {
        const modules = Object.values(window.SML?.moduleRegistry || {}).map(module => module.moduleExports)
          .filter(module => typeof module?.g === 'function' && typeof module.a === 'function' && typeof module.s === 'function'
            && module.g.toString().includes('titleIcon') && module.g.toString().includes('leadingIcon'));
        if (modules.length !== 1) return null;
        const settings = modules[0], options = settings.g()?.options;
        if (!['0', '1', '2'].every(key => typeof options?.[key]?.label === 'string') || !['0', '1', '2'].includes(settings.a())) return null;
        return { apply(mode) {
          const selected = mode === 'dark' ? '2' : '1';
          settings.s(selected);
          if (settings.a() !== selected) throw new Error('Native preference was not saved.');
          return { reloadRequired: true };
        } };
      }
      if (typeof window.require !== 'function') return null;
      if (host === 'www.facebook.com') {
        const settings = window.require('CometDarkMode');
        return typeof settings?.saveDarkModeSetting === 'function' && typeof settings?.getDarkModeSetting === 'function'
          ? { apply: mode => settings.saveDarkModeSetting(mode === 'dark' ? 'ENABLED' : 'DISABLED', { onRevert() {} }) } : null;
      }
      if (host === 'www.instagram.com') {
        const theme = window.require('PolarisIGTheme.react');
        const value = theme?.IGThemeContext && findProvider(theme.IGThemeContext,
          value => typeof value?.toggleTheme === 'function' && typeof value?.getTheme === 'function');
        if (!value || !['light', 'dark'].includes(value.getTheme())) return null;
        return { currentMode: value.getTheme(), apply() {
          if (value.hasTemporaryForcedTheme) throw new Error('Site theme is temporarily locked.');
          value.toggleTheme();
        } };
      }
      const context = window.require('CometDarkModeContext');
      const value = context && findProvider(context, value => typeof value?.setDarkModeSetting === 'function'
        && ['ENABLED', 'DISABLED', 'USE_SYSTEM'].includes(value.currentSetting));
      return value ? { apply: mode => value.setDarkModeSetting(mode === 'dark' ? 'ENABLED' : 'DISABLED') } : null;
    } catch { return null; }
  };
  const compatibleNativeWrites = () => {
    const names = host === 'www.youtube.com' ? ['PREF'] : host === 'www.tiktok.com'
      ? ['tiktok_webapp_theme', 'tiktok_webapp_theme_source', 'tiktok_webapp_theme_manual'] : [];
    if (!names.length || Object.hasOwn(document, 'cookie')) return () => {};
    const native = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (!native?.get || !native.set) return () => {};
    const set = function (text) {
      if (typeof text === 'string' && names.includes(text.slice(0, text.indexOf('=')).trim()) && !/;\s*samesite\s*=/i.test(text)) {
        text += '; SameSite=None' + (/;\s*secure\s*(?:;|$)/i.test(text) ? '' : '; Secure');
      }
      native.set.call(this, text);
    };
    Object.defineProperty(document, 'cookie', { configurable: true, enumerable: native.enumerable, get: native.get, set });
    return () => { if (Object.getOwnPropertyDescriptor(document, 'cookie')?.set === set) delete document.cookie; };
  };
  if (host === 'www.reddit.com' && !findSettings()) {
    const feature = document.getElementById('expand-user-drawer-button')?.closest('activate-feature');
    if (typeof feature?._activateFeature !== 'function' || !/^UserDrawerMenu_/.test(feature.name || '')) return unavailable();
    // Load the app's own account-feature code without dispatching its open event.
    let timer;
    try {
      await Promise.race([feature._activateFeature(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native theme initialization timed out.')), 4000);
      })]);
    } catch { return unavailable(); } finally { clearTimeout(timer); }
  }
  const deadline = Date.now() + 3000;
  let settings = findSettings();
  while (!settings && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    settings = findSettings();
  }
  if (!settings) return unavailable();
  if (mode === 'site' || readMode() === mode) return { supported: true, mode: readMode(), native: true };
  // App-owned setters save the preference and render the complete native palette.
  let outcome;
  const restoreWrites = compatibleNativeWrites();
  try {
    outcome = await settings.apply(mode);
    if (outcome?.reloadRequired) return { supported: true, applied: true, mode: readMode(), native: true, reloadRequired: true };
    // Native optimistic palette updates can precede provider commits and cookie effects.
    const appliedMode = () => readMode() === mode
      && (!['www.instagram.com', 'www.tiktok.com'].includes(host) || findSettings()?.currentMode === mode)
      && (!settings.applied || settings.applied(mode));
    const applyDeadline = Date.now() + 2000;
    while (!appliedMode() && Date.now() < applyDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    const applied = appliedMode();
    return { supported: true, applied: Boolean(applied), mode: readMode(), native: true,
      ...(applied ? {} : { error: 'Site theme change failed.' }) };
  } catch {
    return { supported: true, applied: false, mode: readMode(), native: true, error: 'Site theme change failed.' };
  } finally { restoreWrites(); }
}
