"use client";

import { useEffect } from "react";

/**
 * Listens for the global 'ourspace:refresh' event dispatched by
 * PullToRefresh and calls the provided callback. Each page registers
 * its own fetch logic here so pull-to-refresh actually re-loads data.
 *
 * The callback should be a stable reference (useCallback) to avoid
 * re-registering the listener on every render.
 */
export function useRefreshListener(onRefresh: () => void): void {
  useEffect(() => {
    type Win = {
      addEventListener: (type: string, fn: () => void) => void;
      removeEventListener: (type: string, fn: () => void) => void;
    };
    const win = globalThis as unknown as Win;
    win.addEventListener("ourspace:refresh", onRefresh);
    return () => win.removeEventListener("ourspace:refresh", onRefresh);
  }, [onRefresh]);
}
