// src/lib/cairo-time.ts

import { MY_TZ } from "@/lib/constants";

/**
 * Cairo-time primitives. The single canonical home for TZ-aware date math.
 *
 * Why a dedicated module: the Vercel runtime is in UTC, the user is in
 * Cairo, and the daily/weekly/monthly window keys need to agree across
 * the day boundary. Doing this with `Date` constructors and offset
 * arithmetic is correct in 23 hours of the year and wrong in the two DST
 * transition hours; we use `Intl.DateTimeFormat` with the IANA zone
 * string so the runtime handles transitions for us.
 *
 * Don't add display-only helpers here. Display formatting (English month
 * names, relative-time, "Wed, May 6") belongs in components or in feature
 * `*-utils.ts` files. This file is purely for date-key construction and
 * windowing math.
 */

const DAY_MS = 86_400_000;

/**
 * Returns `YYYY-MM-DD` for the given instant in the given IANA TZ.
 * Uses `Intl.DateTimeFormat` so DST is handled correctly.
 *
 * `at` may be a Unix ms number or a Date. The `en-CA` locale formats as
 * ISO `YYYY-MM-DD` by default — same shape used everywhere in the repo.
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
 * Today's date key in Cairo. The single canonical "now is what day"
 * helper. Pass `now` when you've already captured it (e.g., a lazy
 * `useState(() => Date.now())`); otherwise it defaults to `Date.now()`.
 */
export function todayKeyCairo(now: number = Date.now()): string {
  return dateKeyInTz(now, MY_TZ);
}

/**
 * Returns the UTC epoch ms for `${yyyymmdd}T${hhmm}` interpreted as
 * local wall-clock time in `tz`. Handles DST correctly via the standard
 * "Intl offset round-trip" technique — round-trip the naive UTC guess
 * through `Intl.DateTimeFormat` to discover the offset that actually
 * applies for that instant in that zone, then subtract.
 *
 * This is the foundation primitive — most other helpers in this file
 * delegate to it.
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

  // What wall-clock does that instant correspond to in `tz`?
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

  // Difference between "what we got back" and "what we put in" is the TZ
  // offset for that instant. Subtract to get the true UTC epoch ms.
  const offsetMs = formattedAsUtcMs - naiveUtcMs;
  return naiveUtcMs - offsetMs;
}

/**
 * Unix ms of 00:00:00.000 Cairo on the given YYYY-MM-DD.
 *
 * Thin wrapper around `tzWallClockToUtcMs(dateKey, "00:00")`. Provided
 * as a named export because "midnight ms for this Cairo date" is a
 * recurring concept across mood, review, and quota windows — the alias
 * reads better at the callsite than the parameterized version.
 */
export function cairoMidnightMs(dateKey: string, tz: string = MY_TZ): number {
  return tzWallClockToUtcMs(dateKey, "00:00", tz);
}

/**
 * Returns the date key one calendar day before `dateKey`, in Cairo
 * terms. Uses noon-anchoring to dodge DST edges — going noon-to-noon
 * across a transition still lands inside the previous calendar day.
 */
export function previousDateKey(dateKey: string, tz: string = MY_TZ): string {
  const noonMs = tzWallClockToUtcMs(dateKey, "12:00", tz);
  return dateKeyInTz(noonMs - DAY_MS, tz);
}

/**
 * Returns the date key one calendar day after `dateKey`, in Cairo
 * terms. Noon-anchored.
 */
export function nextDateKey(dateKey: string, tz: string = MY_TZ): string {
  const noonMs = tzWallClockToUtcMs(dateKey, "12:00", tz);
  return dateKeyInTz(noonMs + DAY_MS, tz);
}

/**
 * Adds N days to a Cairo `YYYY-MM-DD` date key. Negative N walks
 * backward. Noon-anchored, so DST transitions don't lose the day.
 *
 * For N === 1 / -1 this matches `nextDateKey` / `previousDateKey`. For
 * larger N it's faster than the equivalent loop because we make one
 * `Intl` call instead of N.
 */
export function addDaysCairo(
  dateKey: string,
  days: number,
  tz: string = MY_TZ,
): string {
  if (days === 0) return dateKey;
  const noonMs = tzWallClockToUtcMs(dateKey, "12:00", tz);
  return dateKeyInTz(noonMs + days * DAY_MS, tz);
}

/**
 * JS-style weekday index (Sun=0, Sat=6) for a Cairo date key.
 *
 * Calendar weekday is timezone-independent for a fully-qualified date,
 * so UTC-midnight construction is correct here. Don't replace this with
 * a `tzWallClockToUtcMs` call — it'd be slower and produce the same
 * answer.
 */
export function weekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Seconds until the next Cairo midnight from `now`. Used as a Redis
 * TTL for keys that should expire at the day boundary specifically
 * (mood, state, hug). Floored to a 60-second minimum so a write
 * landing at 23:59:59 doesn't get a 1-second TTL.
 *
 * Replaces the older `toLocaleString` round-trip pattern, which
 * produced a Date in server-local time labeled with Cairo wall-clock —
 * arithmetically correct only by coincidence. This version is
 * arithmetic-only over Cairo midnight ms.
 */
export function secondsUntilCairoMidnight(now: number = Date.now()): number {
  const tomorrow = nextDateKey(todayKeyCairo(now));
  const tomorrowMidnightMs = cairoMidnightMs(tomorrow);
  return Math.max(60, Math.floor((tomorrowMidnightMs - now) / 1000));
}

/**
 * Unix ms for the start of the current calendar month in Cairo.
 * Used as the lower bound for monthly quota windows.
 *
 * Replaces the prior `+02:00` hardcoded-offset implementation in
 * `permissions.ts`, which drifted by an hour during EEST (last Friday
 * of April → last Friday of October). This version is DST-correct.
 */
export function startOfCairoMonthMs(now: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MY_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(now));
  const byType: Record<string, string> = {};
  for (const p of parts) byType[p.type] = p.value;
  return cairoMidnightMs(`${byType.year}-${byType.month}-01`);
}
