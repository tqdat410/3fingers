// Serialized by chrome.scripting: keep this function self-contained.
export function applySocialTheme(mode = 'site') {
  if (!['site', 'light', 'dark'].includes(mode)) throw new Error('Invalid theme.');
  const supportedHost = ['www.facebook.com', 'www.instagram.com', 'www.threads.com'].includes(location.hostname);
  if (!supportedHost || top === window || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return { supported: false };
  const root = document.documentElement;
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
