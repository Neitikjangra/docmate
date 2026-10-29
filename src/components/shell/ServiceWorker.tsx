"use client";

import { useEffect } from "react";

/**
 * Registers the Docmate service worker. Renders nothing.
 *
 * AppShell / layout should mount this once (e.g. inside AppShell) so the PWA
 * shell is cached on first production load; it is a no-op in development and in
 * browsers without service-worker support.
 */
export function ServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } catch {
      // Registration is best-effort; the app works without it.
    }
  }, []);

  return null;
}

export default ServiceWorker;
