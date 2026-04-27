"use client";

import { useState, useEffect } from "react";
import { getNavBadges, type NavBadges } from "@/app/actions/badges";

const POLL_INTERVAL_MS = 30_000;
const INITIAL: NavBadges = { pendingTasks: 0, unacknowledgedRules: 0 };

/**
 * Polls badge counts every 30 s. The lightweight nature of
 * `getNavBadges` (only fetches counts, not full objects) makes
 * polling at this interval negligible in Upstash command terms.
 */
export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>(INITIAL);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      const result = await getNavBadges();
      if (!mounted) return;
      setTimeout(() => setBadges(result), 0);
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return badges;
}
