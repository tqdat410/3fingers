(() => {
  // MAIN-world code has no extension APIs. Restrict this unprivileged adjustment
  // to direct extension frames carrying the existing workspace pane marker.
  if (window === window.top || location.hostname !== 'www.threads.com'
    || location.ancestorOrigins.length !== 1
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(location.ancestorOrigins[0])
    || !/^3fingers:[a-zA-Z0-9_-]{1,64}:[a-f0-9-]+$/.test(window.name)) return;

  const NativeObserver = window.IntersectionObserver;
  window.IntersectionObserver = new Proxy(NativeObserver, {
    construct(Target, args, NewTarget) {
      const observer = Reflect.construct(Target, args, NewTarget);
      // Threads currently uses this viewport configuration for its feed tail.
      // Different configurations retain native behavior after site changes.
      if (location.pathname !== '/' || observer.root !== null || observer.rootMargin !== '4000px 4000px 4000px 4000px'
        || observer.thresholds.length !== 1 || observer.thresholds[0] !== 0) return observer;
      // An implicit root crosses the extension iframe boundary and loses margins.
      // The local document keeps prefetch relative to this panel's viewport.
      return Reflect.construct(Target, [args[0], {
        ...args[1], root: document, threshold: observer.thresholds,
        rootMargin: '4000px 4000px 6000px 4000px',
        scrollMargin: observer.scrollMargin, delay: observer.delay,
        trackVisibility: observer.trackVisibility,
      }], NewTarget);
    },
  });
})();
