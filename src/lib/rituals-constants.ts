// src/lib/rituals-constants.ts

export const DEFAULT_WINDOW_DURATION_MINUTES = 120;
export const MIN_WINDOW_DURATION_MINUTES = 15;
export const MAX_WINDOW_DURATION_MINUTES = 12 * 60;

export const DEFAULT_WINDOW_START = "22:00";

// All cadences supported. Daily is the default.
export const SUPPORTED_CADENCES = ["daily", "weekly", "every_n_days"] as const;

// Weekly cadence — weekday indices match JS Date.getUTCDay() (Sun=0, Sat=6).
// Order matters: array index = weekday number.
export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_LONG_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// Every-N-days cadence bounds. N=1 collapses to daily; reject and tell the
// user to pick daily instead. N>30 is unusual enough we ask for it
// explicitly later if needed.
export const MIN_EVERY_N_DAYS = 2;
export const MAX_EVERY_N_DAYS = 30;
export const DEFAULT_EVERY_N_DAYS = 3;

// Maximum text length on a submission payload.
export const MAX_SUBMISSION_TEXT_LENGTH = 4_000;

// History ZSET cap — older occurrences are still queryable but the page's
// dot row only renders the last N days.
export const HISTORY_DOT_ROW_DAYS = 14;
