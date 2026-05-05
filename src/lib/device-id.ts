// src/lib/device-id.ts
// Client-only helpers to mint and persist a stable device identifier.

import { isNative } from "./native";

const STORAGE_KEY = "ourspace:device-id";

/**
 * Returns a stable per-device identifier. On native we prefer
 * `@capacitor/device` `getId()` (`ANDROID_ID` on Android), which survives
 * app reinstalls within the same Android user account. On web we fall
 * back to a UUID stored in `localStorage`. If neither is available, we
 * emit a `transient:*` id which gets a new value per page load — better
 * than crashing, but the admin list will accumulate ghost devices until
 * pruned (rare in practice on this stack).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (isNative()) {
    try {
      const { Device } = await import("@capacitor/device");
      const { identifier } = await Device.getId();
      if (identifier) return `native:${identifier}`;
    } catch {
      // fall through
    }
  }

  const ls = (
    globalThis as unknown as { localStorage?: Storage }
  ).localStorage;
  if (!ls) {
    const c = (
      globalThis as unknown as { crypto?: { randomUUID?: () => string } }
    ).crypto;
    return `transient:${c?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  }
  const existing = ls.getItem(STORAGE_KEY);
  if (existing) return existing;
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
    .crypto;
  const id = `web:${c?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  try {
    ls.setItem(STORAGE_KEY, id);
  } catch {
    // private mode / storage quota — ignore
  }
  return id;
}

interface FingerprintArgs {
  platform: string;
  manufacturer?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  webUserAgent?: string;
}

/**
 * Build a short human-readable label that identifies a device in the
 * admin UI. Native: `${manufacturer} ${model} · Android ${osVersion} · app
 * ${appVersion}`. Web: `${browser} on ${os}`.
 */
export function buildFingerprint(args: FingerprintArgs): string {
  if (args.platform === "android" || args.platform === "ios") {
    const osLabel =
      args.platform === "ios" ? "iOS" : "Android";
    const parts = [
      [args.manufacturer, args.model].filter(Boolean).join(" "),
      args.osVersion ? `${osLabel} ${args.osVersion}` : osLabel,
      args.appVersion ? `app ${args.appVersion}` : null,
    ].filter(Boolean) as string[];
    return parts.join(" · ") || "Native device";
  }
  if (args.webUserAgent) {
    const ua = args.webUserAgent;
    let browser = "Web";
    if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Safari/")) browser = "Safari";
    let os = "Unknown OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS X")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
    return `${browser} on ${os}`;
  }
  return "Unknown device";
}
