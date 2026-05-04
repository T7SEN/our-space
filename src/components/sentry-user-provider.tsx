// src/components/sentry-user-provider.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getCurrentAuthor } from "@/app/actions/auth";
import { isNative } from "@/lib/native";
import { logger } from "@/lib/logger";

/**
 * Tags every client-side Sentry event with the current author so the
 * Sentry UI groups events by phone (T7SEN vs Besho). Mirrors the
 * `FCMProvider` shape — pathname-driven `getCurrentAuthor` poll, no
 * cleanup needed because `Sentry.setUser(null)` is idempotent.
 *
 * Also captures device + app metadata once on mount via @capacitor/device
 * and @capacitor/app. Native-only; web sessions skip the fetch silently.
 *
 * Server and Edge errors are tagged via `beforeSend` hooks in
 * `sentry.server.config.ts` / `sentry.edge.config.ts`. This component
 * only handles the browser SDK.
 */
export function SentryUserProvider() {
  const [author, setAuthor] = useState<string | null>(null);
  const pathname = usePathname();

  // Re-fetch on pathname change so logout (which redirects) clears the
  // user, and post-login (which also redirects) sets the new user.
  useEffect(() => {
    getCurrentAuthor().then(setAuthor);
  }, [pathname]);

  useEffect(() => {
    if (author === null) {
      Sentry.setUser(null);
      Sentry.setTag("app.author", undefined);
      return;
    }
    // `id` and `username` both set to the author label. No PII —
    // T7SEN/Besho are role identifiers, not real names.
    Sentry.setUser({ id: author, username: author });
    Sentry.setTag("app.author", author);
  }, [author]);

  // Device + app context. Mount-only; native-only.
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ Device }, { App }] = await Promise.all([
          import("@capacitor/device"),
          import("@capacitor/app"),
        ]);
        const [info, idInfo, appInfo] = await Promise.all([
          Device.getInfo(),
          Device.getId(),
          App.getInfo(),
        ]);
        if (cancelled) return;

        Sentry.setContext("device", {
          model: info.model,
          manufacturer: info.manufacturer,
          platform: info.platform,
          os: info.operatingSystem,
          os_version: info.osVersion,
          android_sdk: info.androidSDKVersion,
          web_view_version: info.webViewVersion,
          is_virtual: info.isVirtual,
          identifier: idInfo.identifier,
        });

        Sentry.setContext("app", {
          name: appInfo.name,
          id: appInfo.id,
          version: appInfo.version,
          build: appInfo.build,
        });

        Sentry.setTag("device.model", info.model);
        Sentry.setTag("device.manufacturer", info.manufacturer);
        Sentry.setTag("device.platform", info.platform);
        Sentry.setTag("device.os_version", info.osVersion);
        Sentry.setTag("app.version", appInfo.version);
        Sentry.setTag("app.build", appInfo.build);
      } catch (err) {
        logger.error("[sentry] device context fetch failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
