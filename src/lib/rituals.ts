// src/lib/rituals.ts

import { MY_TZ } from "@/lib/constants";
import {
  dateKeyInTz,
  nextDateKey,
  previousDateKey,
  tzWallClockToUtcMs,
  weekdayOfDateKey,
} from "@/lib/cairo-time";

/**
 * Ritual-semantic helpers only. TZ primitives live in `@/lib/cairo-time`.
 * This module composes those primitives into ritual-domain concepts —
 * windows, prescribed days, streaks, today-state.
 */

export interface WindowBounds {
  opensAtMs: number;
  closesAtMs: number;
}

/**
 * Computes the window open/close epoch ms for a given Cairo date.
 * Supports midnight-crossing windows (e.g. 22:00 + 180min closes at
 * 01:00 next day).
 */
export function windowBoundsForCairoDate(
  dateKey: string,
  windowStart: string,
  durationMinutes: number,
): WindowBounds {
  const opensAtMs = tzWallClockToUtcMs(dateKey, windowStart, MY_TZ);
  const closesAtMs = opensAtMs + durationMinutes * 60_000;
  return { opensAtMs, closesAtMs };
}

export type RitualTodayState =
  | "paused"
  | "inactive"
  | "not_prescribed_today"
  | "upcoming"
  | "open"
  | "completed_today"
  | "missed_today";

/**
 * Cadence config for the helpers. Daily ignores the optional fields.
 */
export interface CadenceConfig {
  cadence: "daily" | "weekly" | "every_n_days";
  weekdays?: number[];
  everyNDays?: number;
  anchorDateKey?: string;
}

/**
 * Returns true if `dateKey` is a fulfillment day under the given
 * cadence.
 *  - daily: every day.
 *  - weekly: dateKey's weekday is in `weekdays`.
 *  - every_n_days: integer days between `anchorDateKey` and `dateKey`
 *    is a non-negative multiple of `everyNDays`.
 */
export function isPrescribedDay(
  config: CadenceConfig,
  dateKey: string,
): boolean {
  if (config.cadence === "daily") return true;
  if (config.cadence === "weekly") {
    const weekdays = config.weekdays;
    if (!weekdays || weekdays.length === 0) return false;
    return weekdays.includes(weekdayOfDateKey(dateKey));
  }
  // every_n_days
  const n = config.everyNDays;
  const anchor = config.anchorDateKey;
  if (!n || n < 1 || !anchor) return false;
  const anchorMs = tzWallClockToUtcMs(anchor, "12:00", MY_TZ);
  const dateMs = tzWallClockToUtcMs(dateKey, "12:00", MY_TZ);
  const diffDays = Math.round((dateMs - anchorMs) / 86_400_000);
  if (diffDays < 0) return false;
  return diffDays % n === 0;
}

/**
 * Walks forward from `fromDateKey` (exclusive) and returns the first
 * date key that is prescribed under the given cadence. Bounded scan —
 * returns after at most 31 days to avoid runaway loops on misconfigured
 * input.
 */
export function nextPrescribedDateKey(
  config: CadenceConfig,
  fromDateKey: string,
): string {
  if (config.cadence === "daily") return nextDateKey(fromDateKey);
  if (config.cadence === "every_n_days") {
    let cursor = fromDateKey;
    const n = Math.max(1, config.everyNDays ?? 1);
    for (let i = 0; i < 31; i += 1) {
      cursor = nextDateKey(cursor);
      if (isPrescribedDay(config, cursor)) return cursor;
      // Every-n-days advancement: jump n-1 extra days when safe.
      if (n > 1) {
        for (let j = 0; j < n - 1; j += 1) cursor = nextDateKey(cursor);
        if (isPrescribedDay(config, cursor)) return cursor;
      }
    }
    return cursor;
  }
  // weekly
  let cursor = fromDateKey;
  for (let i = 0; i < 14; i += 1) {
    cursor = nextDateKey(cursor);
    if (isPrescribedDay(config, cursor)) return cursor;
  }
  return cursor;
}

/**
 * Walks backward from `fromDateKey` (exclusive) and returns the first
 * date key that is prescribed under the given cadence. Bounded scan.
 */
export function previousPrescribedDateKey(
  config: CadenceConfig,
  fromDateKey: string,
): string {
  if (config.cadence === "daily") return previousDateKey(fromDateKey);
  let cursor = fromDateKey;
  for (let i = 0; i < 60; i += 1) {
    cursor = previousDateKey(cursor);
    if (isPrescribedDay(config, cursor)) return cursor;
  }
  return cursor;
}

/**
 * Validates a `HH:MM` 24h time string. Returns null if invalid,
 * normalized `HH:MM` if valid.
 */
export function parseAndNormalizeHHMM(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Formats a window range like "22:00 – 00:00" (Cairo) for display.
 */
export function formatWindowRange(
  windowStart: string,
  durationMinutes: number,
): string {
  const [hh, mm] = windowStart.split(":").map(Number);
  const totalMinutes = hh * 60 + mm + durationMinutes;
  const endHh = Math.floor(totalMinutes / 60) % 24;
  const endMm = totalMinutes % 60;
  const end = `${String(endHh).padStart(2, "0")}:${String(endMm).padStart(2, "0")}`;
  return `${windowStart} – ${end}`;
}

/**
 * Walks a sorted-ascending list of completion date keys and returns
 * the length of the streak ending at `endDateKey` under the given
 * cadence. A "streak" is consecutive PRESCRIBED occurrences with no
 * gap.
 *
 * Returns 0 if `endDateKey` is not in the list.
 */
export function computeStreak(
  config: CadenceConfig,
  completedDateKeysAsc: string[],
  endDateKey: string,
): number {
  if (completedDateKeysAsc.length === 0) return 0;
  const set = new Set(completedDateKeysAsc);
  if (!set.has(endDateKey)) return 0;

  let streak = 0;
  let cursor = endDateKey;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousPrescribedDateKey(config, cursor);
    // Safety net — bound at 1000 to prevent any pathological infinite loop.
    if (streak > 1000) break;
  }
  return streak;
}

interface ComputeRitualTodayStateArgs {
  active: boolean;
  pausedUntilMs: number | null;
  cadence: CadenceConfig["cadence"];
  weekdays?: number[];
  everyNDays?: number;
  anchorDateKey?: string;
  windowStart: string;
  durationMinutes: number;
  now: number;
  hasOccurrenceForOwningDate: (dateKey: string) => boolean;
}

interface ComputeRitualTodayStateResult {
  state: RitualTodayState;
  owningDateKey: string;
  bounds: WindowBounds;
}

/**
 * Computes the ritual's display state for "today" given the cadence,
 * window, and current time. Owning-date logic accounts for
 * midnight-crossing windows: if a 22:00+180min window opens yesterday
 * and is still inside its duration, "today's" obligation actually
 * belongs to yesterday's date key.
 */
export function computeRitualTodayState(
  args: ComputeRitualTodayStateArgs,
): ComputeRitualTodayStateResult {
  const { active, pausedUntilMs, now } = args;
  const cadenceConfig: CadenceConfig = {
    cadence: args.cadence,
    weekdays: args.weekdays,
    everyNDays: args.everyNDays,
    anchorDateKey: args.anchorDateKey,
  };

  const todayKey = dateKeyInTz(now, MY_TZ);
  const yesterdayKey = previousDateKey(todayKey);

  const todayBounds = windowBoundsForCairoDate(
    todayKey,
    args.windowStart,
    args.durationMinutes,
  );
  const yesterdayBounds = windowBoundsForCairoDate(
    yesterdayKey,
    args.windowStart,
    args.durationMinutes,
  );

  const todayPrescribed = isPrescribedDay(cadenceConfig, todayKey);
  const yesterdayPrescribed = isPrescribedDay(cadenceConfig, yesterdayKey);

  // Owning-date priority:
  // 1. Yesterday prescribed AND window still open → owning = yesterday.
  // 2. Today prescribed → owning = today.
  // 3. Else not_prescribed_today, owning = today (display only).
  let bounds: WindowBounds;
  let owningDateKey: string;
  let isOwningDayPrescribed: boolean;

  if (
    yesterdayPrescribed &&
    now >= yesterdayBounds.opensAtMs &&
    now < yesterdayBounds.closesAtMs
  ) {
    bounds = yesterdayBounds;
    owningDateKey = yesterdayKey;
    isOwningDayPrescribed = true;
  } else if (todayPrescribed) {
    bounds = todayBounds;
    owningDateKey = todayKey;
    isOwningDayPrescribed = true;
  } else {
    bounds = todayBounds;
    owningDateKey = todayKey;
    isOwningDayPrescribed = false;
  }

  if (!active) {
    return { state: "inactive", owningDateKey, bounds };
  }
  if (pausedUntilMs !== null && now < pausedUntilMs) {
    return { state: "paused", owningDateKey, bounds };
  }
  if (!isOwningDayPrescribed) {
    return { state: "not_prescribed_today", owningDateKey, bounds };
  }

  if (args.hasOccurrenceForOwningDate(owningDateKey)) {
    return { state: "completed_today", owningDateKey, bounds };
  }

  if (now < bounds.opensAtMs) {
    return { state: "upcoming", owningDateKey, bounds };
  }
  if (now < bounds.closesAtMs) {
    return { state: "open", owningDateKey, bounds };
  }
  return { state: "missed_today", owningDateKey, bounds };
}
