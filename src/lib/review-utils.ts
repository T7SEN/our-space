// src/lib/review-utils.ts

import { MY_TZ } from "@/lib/constants";
import {
  addDaysCairo,
  cairoMidnightMs,
  todayKeyCairo,
  weekdayOfDateKey,
} from "@/lib/cairo-time";
import type { ReviewAuthor } from "@/lib/review-constants";

/**
 * Review-domain TZ helpers. Pure date math; no Redis. TZ primitives
 * are imported from `@/lib/cairo-time`.
 *
 * Review weeks run Sunday → Saturday in Cairo. The "starting Sunday"
 * date key (e.g. `2025-11-02`) identifies a week. The submission window
 * is the 48 hours straddling that week's end: Saturday 00:00 → Sunday
 * 23:59:59.999 Cairo.
 */

/**
 * The Sunday that starts the most-recently-completed (or currently
 * closing) review week, in Cairo.
 *
 *  - During Sat 00:00 → Sun 23:59 of week W: returns the Sunday that
 *    started week W. (Submission window for W is open.)
 *  - During Mon-Fri after week W: returns the same Sunday. (W's window
 *    is closed; W is the most recent reviewable week.)
 *  - At Sat 00:00 of the next week: rolls forward to the new Sunday.
 *
 * Mechanics: find the most recent Saturday ≤ now in Cairo, then
 * subtract 6 days to land on the Sunday that opened that Sat→Sun week.
 */
export function currentReviewWeekDate(now: number): string {
  const todayStr = todayKeyCairo(now);
  const dow = weekdayOfDateKey(todayStr); // 0=Sun .. 6=Sat
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
  const todayStr = todayKeyCairo(now);
  const dow = weekdayOfDateKey(todayStr);
  let daysToNextSat: number;
  if (dow === 6)
    daysToNextSat = 7; // Today is Saturday → next Saturday is +7
  else if (dow === 0)
    daysToNextSat = 6; // Sunday → next Saturday is +6
  else daysToNextSat = 6 - dow; // Mon=5, Tue=4, ..., Fri=1
  return cairoMidnightMs(addDaysCairo(todayStr, daysToNextSat));
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
