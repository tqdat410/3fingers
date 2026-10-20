(() => {
  if (globalThis.__threeFingersFeed || window === window.top) return;
  const match = /^3fingers:([a-zA-Z0-9_-]{1,64}):([a-f0-9-]+)$/.exec(window.name);
  if (!match) return;
  globalThis.__threeFingersFeed = true;
  const [, paneId, session] = match;
  let port, ready = false, nativeScrolling = false, sequence = 0, root, previous = 0, intentUntil = 0, suppressUntil = 0;
  let pendingDelta = 0, scheduled = false, watchInteractions = false, navigationPending = false;
  let geometry;
  let layoutCheckScheduled = false;
  let anchor;
  let swipe = null, suppressedClick = null;
  const scrollKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '];
  const ignoredSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog,[role="dialog"],[aria-modal="true"],[data-chat],[data-scroll-ignore]';

  function ignored(element) {
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest(ignoredSelector) || element.closest('[aria-label*="chat" i],[aria-label*="messag" i],[aria-label*="tin nh\u1eafn" i]'));
  }
  function viewport(element) { return element === document.scrollingElement ? innerHeight : element.clientHeight; }
  function visibleArea(element) {
    if (!element?.isConnected || element.closest('[hidden],[aria-hidden="true"],[inert]')) return 0;
    const style = getComputedStyle(element);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return 0;
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left))
      * Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
  }
  function usableRoot(element) {
    if (!element?.isConnected || ignored(element) || element.scrollHeight <= viewport(element) + 2) return false;
    if (element === document.scrollingElement) {
      return ![document.documentElement, document.body].filter(Boolean)
        .some(node => ['hidden', 'clip'].includes(getComputedStyle(node).overflowY));
    }
    return visibleArea(element) > 0 && element.clientHeight >= innerHeight * 0.35
      && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY);
  }
  function modalOpen() {
    return [...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].some(element => visibleArea(element) > 0);
  }
  function rememberAnchor() {
    if (!root) return;
    const rect = root === document.scrollingElement ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : root.getBoundingClientRect();
    const element = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 100));
    anchor = element && root.contains(element) ? { element, top: element.getBoundingClientRect().top, scroll: root.scrollTop } : null;
  }
  function resetForLayout() {
    const selected = chooseRoot();
    if (!selected) return;
    const current = { root: selected, height: viewport(selected), range: selected.scrollHeight };
    const anchorMoved = anchor && (!anchor.element.isConnected || Math.abs(
      anchor.element.getBoundingClientRect().top - anchor.top + selected.scrollTop - anchor.scroll) > 2);
    const clamped = geometry && geometry.range > current.range && previous > Math.max(0, current.range - current.height);
    if (geometry && (geometry.root !== current.root || geometry.height !== current.height || clamped || anchorMoved)) {
      // Discard anchoring/clamping without cutting off wheel momentum.
      // Shrinking below the viewport does not itself change the reading offset.
      previous = selected.scrollTop;
    }
    geometry = current;
    rememberAnchor();
  }
  function chooseRoot() {
    if (usableRoot(root)) return root;
    const documentRoot = document.scrollingElement;
    let best = usableRoot(documentRoot) ? documentRoot : undefined;
    let score = best ? innerWidth * innerHeight : 0;
    for (const element of document.querySelectorAll('main,[role="main"],[role="feed"],div,section')) {
      if (!usableRoot(element)) continue;
      const area = visibleArea(element);
      const weighted = area * (element.matches('main,[role="main"],[role="feed"]') ? 1.2 : 1);
      if (weighted > score) { best = element; score = weighted; }
    }
    if (best !== root) {
      pendingDelta = 0;
      intentUntil = 0;
      root?.removeAttribute('data-three-fingers-feed-scroller');
      if (root && root !== document.documentElement) resize.unobserve(root);
      root = best;
      root?.setAttribute('data-three-fingers-feed-scroller', '');
      if (root && root !== document.documentElement) resize.observe(root);
      previous = root?.scrollTop || 0;
    }
    return root;
  }
  function isFeedGesture(target, localSwipe = false) {
    if ((nativeScrolling || navigationPending) && !localSwipe || ignored(target) || modalOpen()) return false;
    const selected = chooseRoot();
    if (!selected) return false;
    let element = target instanceof Element ? target : target?.parentElement;
    while (element && element !== selected && element !== document.documentElement) {
      const style = getComputedStyle(element);
      if (element.scrollHeight > element.clientHeight + 2 && ['auto', 'scroll'].includes(style.overflowY)) return false;
      element = element.parentElement;
    }
    return selected === document.scrollingElement || selected.contains(target);
  }
  function beginFeedIntent(target) {
    resetForLayout();
    const feedGesture = isFeedGesture(target);
    intentUntil = feedGesture ? performance.now() + 650 : 0;
    if (feedGesture) suppressUntil = 0;
  }
  for (const type of ['wheel', 'pointerdown']) {
    document.addEventListener(type, event => beginFeedIntent(event.target), { capture: true, passive: true });
  }
  document.addEventListener('keydown', event => {
    if (scrollKeys.includes(event.key)) beginFeedIntent(event.target);
  }, true);
  document.addEventListener('scroll', event => {
    if (nativeScrolling || navigationPending) return;
    resetForLayout();
    const selected = root || chooseRoot();
    if (!selected || !(event.target === selected || (event.target === document && selected === document.scrollingElement))) return;
    const current = selected.scrollTop;
    const delta = (current - previous) / viewport(selected);
    previous = current;
    const now = performance.now();
    if (!ready || now < suppressUntil || now > intentUntil || !Number.isFinite(delta) || !delta) return;
    intentUntil = now + 350;
    pendingDelta += delta;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        chooseRoot();
        if (ready && !nativeScrolling && !navigationPending && pendingDelta) {
          try { port.postMessage({ type: 'scroll', session, sequence: sequence++, delta: pendingDelta }); } catch { ready = false; }
        }
        pendingDelta = 0;
      });
    }
  }, true);
  const mutations = new MutationObserver(records => {
    if (layoutCheckScheduled || !records.some(record => !root?.isConnected || root.contains(record.target)
      || record.target instanceof Element && record.target.contains(root))) return;
    layoutCheckScheduled = true;
    requestAnimationFrame(() => { layoutCheckScheduled = false; resetForLayout(); });
  });
  mutations.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert'] });
  const resize = new ResizeObserver(resetForLayout);
  if (document.documentElement) resize.observe(document.documentElement);
  window.addEventListener('resize', resetForLayout, { passive: true });
  function finishSwipe() {
    if (!swipe) return;
    const current = swipe; swipe = null;
    document.documentElement.removeAttribute('data-three-fingers-grabbing');
    if (current.snap) {
      if (current.snap.value) current.root.style.setProperty('scroll-snap-type', current.snap.value, current.snap.priority);
      else current.root.style.removeProperty('scroll-snap-type');
    }
    if (current.active) {
      intentUntil = 0; pendingDelta = 0;
      suppressUntil = performance.now() + 250;
      suppressedClick = { pointerId: current.pointerId, until: performance.now() + 400 };
    }
    if (document.documentElement.hasPointerCapture(current.pointerId)) document.documentElement.releasePointerCapture(current.pointerId);
  }
  document.addEventListener('pointerdown', event => {
    // A fresh press is a new interaction, not the synthetic click after a swipe.
    suppressedClick = null;
    if (!ready || event.pointerType === 'touch' || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || !isFeedGesture(event.target, true)) return;
    const control = event.target.closest('button,[role="button"],video[controls],audio[controls]');
    if (control) {
      const rect = control.getBoundingClientRect();
      if (control.matches('video,audio') || rect.width <= 140 && rect.height <= 96) return;
    }
    finishSwipe();
    swipe = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, root: chooseRoot(), active: false };
  }, true);
  document.addEventListener('pointermove', event => {
    if (event.pointerId !== swipe?.pointerId) return;
    if (!usableRoot(swipe.root) || chooseRoot() !== swipe.root || modalOpen()) { finishSwipe(); return; }
    if (!swipe.active) {
      const dy = event.clientY - swipe.y, dx = event.clientX - swipe.x;
      if (Math.abs(dy) < 8 || Math.abs(dy) <= Math.abs(dx)) return;
      swipe.active = true;
      if (nativeScrolling) {
        // Native video snapping would otherwise undo each small drag increment.
        swipe.snap = { value: swipe.root.style.getPropertyValue('scroll-snap-type'), priority: swipe.root.style.getPropertyPriority('scroll-snap-type') };
        swipe.root.style.setProperty('scroll-snap-type', 'none', 'important');
      }
      document.documentElement.setPointerCapture(event.pointerId);
      document.documentElement.setAttribute('data-three-fingers-grabbing', '');
      getSelection()?.removeAllRanges();
    }
    event.preventDefault(); event.stopImmediatePropagation();
    intentUntil = 0; pendingDelta = 0; suppressUntil = performance.now() + 250;
    const maximum = Math.max(0, swipe.root.scrollHeight - viewport(swipe.root));
    swipe.root.scrollTo({ top: Math.max(0, Math.min(maximum, swipe.root.scrollTop + swipe.lastY - event.clientY)), behavior: 'instant' });
    swipe.lastY = event.clientY; previous = swipe.root.scrollTop; rememberAnchor();
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', event => {
    if (event.pointerId !== swipe?.pointerId) return;
    if (swipe.active) { event.preventDefault(); event.stopImmediatePropagation(); }
    finishSwipe();
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) document.addEventListener(type, event => {
    if (event.pointerId === swipe?.pointerId) finishSwipe();
  }, true);
  document.addEventListener('dragstart', event => {
    if (swipe && Math.abs(event.clientY - swipe.y) >= Math.abs(event.clientX - swipe.x)) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    if (suppressedClick && performance.now() < suppressedClick.until && event.detail > 0 && event.pointerId === suppressedClick.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressedClick = null;
    }
  }, true);
  for (const type of ['touchstart', 'touchmove']) document.addEventListener(type, event => {
    if (isFeedGesture(event.target)) { intentUntil = 0; pendingDelta = 0; suppressUntil = Infinity; }
  }, { capture: true, passive: true });
  for (const type of ['touchend', 'touchcancel']) document.addEventListener(type, () => {
    if (suppressUntil === Infinity) suppressUntil = performance.now() + 1000;
  }, { capture: true, passive: true });
  window.addEventListener('blur', finishSwipe);
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown']) document.addEventListener(type, () => {
    if (!ready || !watchInteractions) return;
    watchInteractions = false;
    port.postMessage({ type: 'interaction', session });
  }, { capture: true, passive: true });
  function reportNativeTheme() {
    if (window.__threeFingersNativeThemeBusy || window.__threeFingersNativeThemeUnsupported !== false) return;
    const element = document.documentElement;
    const host = location.hostname;
    const mode = ['x.com', 'www.tiktok.com'].includes(host) ? element.getAttribute('data-theme')
      : host === 'www.youtube.com' ? (element.hasAttribute('dark') ? 'dark' : 'light')
      : host === 'www.reddit.com' ? (element.classList.contains('theme-dark') || !element.classList.contains('theme-light') && getComputedStyle(element).colorScheme === 'dark' ? 'dark' : 'light')
      : element.classList.contains('__fb-dark-mode') || element.classList.contains('_aa4d') ? 'dark' : 'light';
    if (ready && ['light', 'dark'].includes(mode) && (host !== 'www.tiktok.com'
      || element.getAttribute('data-tux-color-scheme') === mode)) {
      port.postMessage({ type: 'native-theme', session, mode });
    }
  }
  if (['www.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tiktok.com', 'www.reddit.com', 'www.youtube.com', 'x.com'].includes(location.hostname)) new MutationObserver(reportNativeTheme)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'dark', 'data-theme', 'data-tux-color-scheme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reportNativeTheme);
  function reportNavigation(event) {
    if (ready) {
      navigationPending = true; pendingDelta = 0; intentUntil = 0;
      port.postMessage({ type: 'navigation', session, url: location.href, kind: event?.navigationType || 'initial' });
    }
  }
  window.navigation?.addEventListener('currententrychange', reportNavigation);
  function connect() {
    try {
      port = chrome.runtime.connect({ name: '3fingers-feed' });
      port.onMessage.addListener(message => {
        if (message.session !== session) return;
        if (message.type === 'ready') { nativeScrolling = message.nativeScrolling === true; watchInteractions = message.watchInteractions === true; ready = true; chooseRoot(); previous = root?.scrollTop || 0; reportNavigation(); if (location.hostname === 'www.tiktok.com') reportNativeTheme(); }
        if (message.type === 'watch-interactions') watchInteractions = message.enabled === true;
        if (message.type === 'scroll-policy' && message.url === location.href) {
          finishSwipe();
          nativeScrolling = message.nativeScrolling === true;
          navigationPending = false; pendingDelta = 0; intentUntil = 0;
          geometry = undefined; anchor = null;
          previous = chooseRoot()?.scrollTop || 0;
          resetForLayout();
        }
        if (message.type === 'back' && ready && typeof message.url === 'string' && new URL(message.url).origin === location.origin) {
          // Joint history traversal can rewind sibling frames; replace only this frame.
          location.replace(message.url);
        }
        if (message.type === 'apply' && ready && !nativeScrolling && !navigationPending && Number.isFinite(message.delta) && Math.abs(message.delta) <= 10) {
          if (modalOpen()) return;
          const selected = chooseRoot();
          if (!selected) return;
          intentUntil = 0;
          suppressUntil = performance.now() + 180;
          const maximum = Math.max(0, selected.scrollHeight - viewport(selected));
          const top = Math.max(0, Math.min(maximum, selected.scrollTop + message.delta * viewport(selected)));
          selected.scrollTo({ top, behavior: 'instant' });
          previous = selected.scrollTop;
        }
      });
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; ready = false; finishSwipe(); setTimeout(connect, 1500); });
      port.postMessage({ type: 'hello', paneId, session });
    } catch { ready = false; }
  }
  chooseRoot();
  resetForLayout();
  connect();
})();
