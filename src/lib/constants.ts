// src/lib/constants.ts
export const START_DATE = new Date("2026-02-08T00:00:00");

export const MY_TZ = "Africa/Cairo";
export const PARTNER_TZ = "Asia/Riyadh";

export const MY_COORDS = { lat: 30.161472, lng: 31.635861 };
export const PARTNER_COORDS = { lat: 28.3833, lng: 36.5833 };

export const MY_LABEL = "Shorouk";
export const PARTNER_LABEL = "Tabuk";

export const MY_CITY = "Al Shorouk, Egypt";
export const PARTNER_CITY = "Tabuk, KSA";

// ── Dynamic titles ────────────────────────────────────────────────────────────
// Edit these to match the titles you use for each other. They drive the
// greeting on the dashboard, the author labels in the notebook, and any other
// place the app refers to either of you by role rather than by handle.
export const T7SEN_TITLE = "Daddy";
export const BESHO_TITLE = "Kitten";

export const TITLE_BY_AUTHOR: Record<"T7SEN" | "Besho", string> = {
  T7SEN: T7SEN_TITLE,
  Besho: BESHO_TITLE,
};

// Label used on the dashboard counter card. Replaces the generic
// "Total Time Together" — change it to whatever frames your dynamic best
// (e.g. "Total Time Bound", "Time Owned", "Hers, His, Ours").
export const COUNTER_LABEL = "Total Time Bound";

export const DISTANCE_KM = 520;

export const BIRTHDAYS = {
  me: { month: 6, day: 11, year: 1998, label: "T7SEN's Birthday" },
  partner: { month: 6, day: 4, year: 2009, label: "Besho's Birthday" },
};

/**
 * The next planned visit date. Set to null when no date is confirmed.
 * Update this value in constants.ts whenever a visit is planned.
 */
export const NEXT_VISIT_DATE: Date | null = null;
