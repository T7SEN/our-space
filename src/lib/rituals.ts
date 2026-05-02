// src/lib/rituals.ts

import { MY_TZ } from "@/lib/constants";

/**
 * Returns `YYYY-MM-DD` for the given instant in the given IANA TZ.
 * Uses `Intl.DateTimeFormat` so DST is handled correctly.
 */
export function dateKeyInTz(at: Date | number, tz: string = MY_TZ): string {
  const date = typeof at === "number" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType: Record<string, string> = {};
  for (const p of parts) byType[p.type] = p.value;
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/**
 * Today's date key in Cairo. The single canonical "now is what day" helper.
 */
export function todayKeyCairo(now: number = Date.now()): string {
  return dateKeyInTz(now, MY_TZ);
}

/**
 * Returns the UTC epoch ms for `${yyyymmdd}T${hhmm}` interpreted as
 * local wall-clock time in `tz`. Handles DST correctly via the standard
 * "Intl offset round-trip" technique.
 */
export function tzWallClockToUtcMs(
  yyyymmdd: string,
  hhmm: string,
  tz: string = MY_TZ,
): number {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);

  // First guess: treat the wall clock as if it were UTC.
  const naiveUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  // Now figure out what wall-clock that instant corresponds to in `tz`.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(naiveUtcMs));
  const byType: Record<string, string> = {};
  for (const p of parts) byType[p.type] = p.value;

  const formattedHour = Number(byType.hour) === 24 ? 0 : Number(byType.hour);
  const formattedAsUtcMs = Date.UTC(
    Number(byType.year),
    Number(byType.month) - 1,
    Number(byType.day),
    formattedHour,
    Number(byType.minute),
    Number(byType.second),
  );

  // The difference between "what we got back" and "what we put in" is the
  // TZ offset for that instant. Subtract it to get the true UTC epoch ms.
  const offsetMs = formattedAsUtcMs - naiveUtcMs;
  return naiveUtcMs - offsetMs;
}

export interface WindowBounds {
  opensAtMs: number;
  closesAtMs: number;
}

/**
 * Computes the window open/close epoch ms for a given Cairo date.
 * Supports midnight-crossing windows (e.g. 22:00 + 180min closes at 01:00 next day).
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
 * Returns the JS-style weekday index (Sun=0, Sat=6) for a Cairo date key.
 * Calendar weekday is timezone-independent for a fully-qualified date, so
 * UTC-midnight construction is correct.
 */
export function weekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Returns true if `dateKey` is a fulfillment day under the given cadence.
 *  - daily: every day.
 *  - weekly: dateKey's weekday is in `weekdays`.
 *  - every_n_days: integer days between `anchorDateKey` and `dateKey` is a
 *    non-negative multiple of `everyNDays`.
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
 * Walks forward from `fromDateKey` (exclusive) and returns the first date
 * key that is prescribed under the given cadence. Bounded scan — returns
 * after at most 31 days to avoid runaway loops on misconfigured input.
 */
export function nextPrescribedDateKey(
  config: CadenceConfig,
  fromDateKey: string,
): string {
  if (config.cadence === "daily") return nextDateKey(fromDateKey);
  if (config.cadence === "every_n_days") {
    let cursor = fromDateKey;
    const n = Math.max(1, config.everyNDays ?? 1);
    for (let i = 0; i < n; i += 1) cursor = nextDateKey(cursor);
    return cursor;
  }
  // weekly — walk one day at a time, capped at 31.
  let cursor = nextDateKey(fromDateKey);
  for (let i = 0; i < 31; i += 1) {
    if (isPrescribedDay(config, cursor)) return cursor;
    cursor = nextDateKey(cursor);
  }
  return cursor;
}

/**
 * Walks backward from `fromDateKey` (exclusive) and returns the first date
 * key that is prescribed under the given cadence. Bounded scan — see
 * `nextPrescribedDateKey`.
 */
export function previousPrescribedDateKey(
  config: CadenceConfig,
  fromDateKey: string,
): string {
  if (config.cadence === "daily") return previousDateKey(fromDateKey);
  if (config.cadence === "every_n_days") {
    let cursor = fromDateKey;
    const n = Math.max(1, config.everyNDays ?? 1);
    for (let i = 0; i < n; i += 1) cursor = previousDateKey(cursor);
    return cursor;
  }
  // weekly
  let cursor = previousDateKey(fromDateKey);
  for (let i = 0; i < 31; i += 1) {
    if (isPrescribedDay(config, cursor)) return cursor;
    cursor = previousDateKey(cursor);
  }
  return cursor;
}

/**
 * Computes today's UI state for a ritual given its config and whether
 * today's occurrence record exists. Pure function — no side effects.
 *
 * Cadence-aware: if today is not a prescribed day, returns
 * `not_prescribed_today` regardless of window bounds. If yesterday was
 * prescribed and yesterday's window is still open (midnight-crossing),
 * owning = yesterday.
 */
export function computeRitualTodayState(args: {
  active: boolean;
  pausedUntilMs: number | null;
  cadence: "daily" | "weekly" | "every_n_days";
  weekdays?: number[];
  everyNDays?: number;
  anchorDateKey?: string;
  windowStart: string;
  durationMinutes: number;
  now: number;
  hasOccurrenceForOwningDate: (dateKey: string) => boolean;
}): {
  state: RitualTodayState;
  owningDateKey: string;
  bounds: WindowBounds;
} {
  const { active, pausedUntilMs, windowStart, durationMinutes, now } = args;
  const cadenceConfig: CadenceConfig = {
    cadence: args.cadence,
    weekdays: args.weekdays,
    everyNDays: args.everyNDays,
    anchorDateKey: args.anchorDateKey,
  };

  const todayKey = todayKeyCairo(now);
  const yesterdayKey = previousDateKey(todayKey);

  const yesterdayBounds = windowBoundsForCairoDate(
    yesterdayKey,
    windowStart,
    durationMinutes,
  );
  const todayBounds = windowBoundsForCairoDate(
    todayKey,
    windowStart,
    durationMinutes,
  );

  const yesterdayPrescribed = isPrescribedDay(cadenceConfig, yesterdayKey);
  const todayPrescribed = isPrescribedDay(cadenceConfig, todayKey);

  // Decide which window we're in (or about to be in). Priority:
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

/**
 * Walks a sorted-ascending list of completion date keys and returns the
 * length of the streak ending at `endDateKey` under the given cadence.
 * A "streak" is consecutive PRESCRIBED occurrences with no gap.
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

/**
 * Returns the date key one calendar day before `dateKey`, in Cairo terms.
 * Uses noon-anchoring to dodge DST edges.
 */
export function previousDateKey(dateKey: string): string {
  const noonMs = tzWallClockToUtcMs(dateKey, "12:00", MY_TZ);
  return dateKeyInTz(noonMs - 24 * 3_600_000, MY_TZ);
}

/**
 * Returns the date key one calendar day after `dateKey`, in Cairo terms.
 * Uses noon-anchoring to dodge DST edges.
 */
export function nextDateKey(dateKey: string): string {
  const noonMs = tzWallClockToUtcMs(dateKey, "12:00", MY_TZ);
  return dateKeyInTz(noonMs + 24 * 3_600_000, MY_TZ);
}

/**
 * Validates a `HH:MM` 24h time string. Returns null if invalid, normalized
 * `HH:MM` if valid.
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
