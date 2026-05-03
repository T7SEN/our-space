// src/lib/review-utils.ts

import { MY_TZ } from "@/lib/constants";
import type { ReviewAuthor } from "@/lib/review-constants";

const DAY_MS = 86_400_000;

/** Returns YYYY-MM-DD in Cairo for the given Unix ms. */
export function cairoDateStr(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Cairo day-of-week (0=Sun … 6=Sat) for the given Unix ms. */
export function cairoDayOfWeek(ms: number): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: MY_TZ,
    weekday: "short",
  }).format(new Date(ms));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/**
 * Unix ms of 00:00:00.000 Cairo on the given YYYY-MM-DD.
 * Robust across DST: Egypt sits at UTC+2 (EET) or UTC+3 (EEST), so
 * we try both candidates and pick whichever round-trips through
 * `cairoDateStr` to the input. Egypt's DST transitions occur on the
 * last Friday of April / October; midnight on any other day is
 * unambiguous, and our week boundaries land on Sundays/Saturdays —
 * never on a transition day.
 */
export function cairoMidnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  for (const offset of [2, 3]) {
    const candidate = Date.UTC(y, m - 1, d, -offset, 0, 0, 0);
    if (cairoDateStr(candidate) === dateStr) return candidate;
  }
  // Defensive fallback — assumes EET. Should never reach.
  return Date.UTC(y, m - 1, d, -2, 0, 0, 0);
}

/**
 * Adds N days to a Cairo YYYY-MM-DD and returns the new YYYY-MM-DD.
 * Uses a 12-hour slack to absorb any DST transitions stepped over.
 */
export function addDaysCairo(dateStr: string, days: number): string {
  const base = cairoMidnightMs(dateStr);
  const probe = base + days * DAY_MS + DAY_MS / 2;
  return cairoDateStr(probe);
}

/**
 * The Sunday that starts the most-recently-completed (or currently
 * closing) review week, in Cairo.
 *
 * - During Sat 00:00 → Sun 23:59 of week W: returns the Sunday that
 *   started week W. (Submission window for W is open.)
 * - During Mon-Fri after week W: returns the same Sunday. (W's window
 *   is closed; W is the most recent reviewable week.)
 * - At Sat 00:00 of the next week: rolls forward to the new Sunday.
 *
 * Mechanics: find the most recent Saturday ≤ now in Cairo, then
 * subtract 6 days to land on the Sunday that opened that Sat→Sun week.
 */
export function currentReviewWeekDate(now: number): string {
  const todayStr = cairoDateStr(now);
  const dow = cairoDayOfWeek(now); // 0=Sun .. 6=Sat
  const daysBackToSat = (dow + 1) % 7; // Sun→1, Mon→2, ..., Sat→0
  const lastSat = addDaysCairo(todayStr, -daysBackToSat);
  return addDaysCairo(lastSat, -6);
}

/** [start, end] Unix ms for the Cairo Sun→Sat range starting at weekDate. */
export function weekRangeMs(weekDate: string): {
  start: number;
  end: number;
} {
  const start = cairoMidnightMs(weekDate);
  const nextSunday = addDaysCairo(weekDate, 7);
  const end = cairoMidnightMs(nextSunday) - 1; // Sat 23:59:59.999
  return { start, end };
}

/** The seven YYYY-MM-DD strings of week starting at weekDate, Sun→Sat. */
export function weekDays(weekDate: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysCairo(weekDate, i));
}

/**
 * Submission window: Saturday 00:00 → Sunday 23:59:59.999 Cairo
 * of the week ending the reviewed period.
 */
export function isWithinSubmissionWindow(
  weekDate: string,
  now: number,
): boolean {
  const open = submissionWindowOpenMs(weekDate);
  const close = submissionWindowCloseMs(weekDate);
  return now >= open && now <= close;
}

export function submissionWindowOpenMs(weekDate: string): number {
  return cairoMidnightMs(addDaysCairo(weekDate, 6)); // Saturday 00:00
}

export function submissionWindowCloseMs(weekDate: string): number {
  return cairoMidnightMs(addDaysCairo(weekDate, 8)) - 1; // Sun 23:59:59.999
}

/**
 * Unix ms of the next Saturday 00:00 Cairo strictly > now. Used by the
 * waiting-card to render "Window reopens in 3d 7h" outside the window.
 */
export function nextSubmissionWindowOpenMs(now: number): number {
  const dow = cairoDayOfWeek(now);
  let daysToNextSat: number;
  if (dow === 6)
    daysToNextSat = 7; // Today is Saturday → next Saturday is +7
  else if (dow === 0)
    daysToNextSat = 6; // Sunday → next Saturday is +6
  else daysToNextSat = 6 - dow; // Mon=5, Tue=4, ..., Fri=1
  const nextSat = addDaysCairo(cairoDateStr(now), daysToNextSat);
  return cairoMidnightMs(nextSat);
}

export function partnerOf(author: ReviewAuthor): ReviewAuthor {
  return author === "T7SEN" ? "Besho" : "T7SEN";
}

/** "Nov 2 – Nov 8" — the human label for a review week, Cairo. */
export function formatWeekLabel(weekDate: string): string {
  const start = cairoMidnightMs(weekDate);
  const endStr = addDaysCairo(weekDate, 6);
  const end = cairoMidnightMs(endStr);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MY_TZ,
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}
