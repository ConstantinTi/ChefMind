'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell.
 *
 * The kitchen WLAN is the flakiest network this app will ever see, and the
 * moment it drops is always the moment you are mid-recipe with dough on your
 * hands. The worker keeps visited pages readable; it never makes them writable,
 * because a queued-up "planned Tuesday" that silently never arrived is worse
 * than an honest error.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
