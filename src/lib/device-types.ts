// src/lib/device-types.ts
// Shared types between the client tracker and the server actions.
// Living in /lib (no "use server" / "use client" pragmas) so both
// sides can import without forcing a platform-specific bundle path.

import type { Author } from "./constants";

export type DevicePlatform = "android" | "ios" | "web" | "unknown";

export interface DeviceInfoInput {
  id: string;
  platform: DevicePlatform;
  manufacturer?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  /** Human-readable label, e.g. "Samsung SM-S911 · Android 14 · app 1.0.0". */
  fingerprint: string;
}

export interface DeviceLocationInput {
  lat: number;
  lng: number;
}

export interface PingDeviceInput {
  id: string;
  /** First call (or refresh after upgrade) carries the full info; subsequent
   *  pings can omit it and the server preserves the existing fields. */
  info?: DeviceInfoInput;
  page?: string;
  location?: DeviceLocationInput;
}

export interface DeviceRecord {
  id: string;
  author: Author;
  platform: DevicePlatform;
  manufacturer?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastPage?: string;
  lastLat?: number;
  lastLng?: number;
  lastLocationAt?: number;
}

/**
 * Threshold below which a device is considered "currently present". Used
 * by both the admin UI (online badge) and the inspector. Tracker pings
 * every 60s, so 90s gives one missed-tick of grace before flipping to
 * offline. Tune in concert with `DeviceTracker.HEARTBEAT_MS`.
 */
export const DEVICE_FRESH_MS = 90_000;
