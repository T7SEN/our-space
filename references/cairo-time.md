# Cairo Time

Canonical TZ-aware date math for Our Space. Single home for the
primitives that mood, review, permissions, rituals, and any future
date-keyed feature compose against.

Module: `src/lib/cairo-time.ts`. Don't reinvent any of these helpers
elsewhere.

---

## Why a dedicated module

The Vercel runtime is in UTC. The user is in Cairo (`MY_TZ` from
`src/lib/constants.ts`). Daily, weekly, and monthly window keys must
agree across the day boundary regardless of where the runtime is.

Doing this with `Date` constructors and offset arithmetic is correct
in 23 hours of the year and wrong in the two DST transition hours.
Egypt observes DST (last Friday of April → last Friday of October),
so the "naive +02:00" hardcode produces an hour of drift across
half the year. We use `Intl.DateTimeFormat` with the IANA zone
string so the runtime handles transitions for us.

Three bugs were eliminated when this module was extracted:

1. **Mood early-morning drift.** `getMoodHistory` used
   `new Date(); d.setDate(d.getDate() - i)` against Vercel's
   server-local time (UTC). Between Cairo 00:00–02:00 (EET) and
   00:00–03:00 (EEST), the day index could be off by one and today's
   mood would be missing from the grid.
2. **Permissions month-boundary DST drift.** The old
   `startOfCairoMonthMs` returned a UTC ms with a hardcoded `+02:00`
   offset string, off by an hour during EEST. Quota windows could
   include or exclude requests landing in the first/last hour of a
   month during half the year.
3. **`secondsUntilMidnight` fragility.** Used `toLocaleString`
   round-trip producing a Date in server-local time labeled with
   Cairo wall-clock — arithmetically correct only by coincidence.
   Replaced with arithmetic-only over Cairo midnight ms.

---

## API

All helpers default `tz` to `MY_TZ` (Cairo). Pass an explicit `tz` if
you ever need a different zone (no current callers do).

### `dateKeyInTz(at, tz?) → "YYYY-MM-DD"`

Format any instant as `YYYY-MM-DD` in the given zone via
`Intl.DateTimeFormat('en-CA', ...)`. The `en-CA` locale outputs ISO
shape directly. `at` accepts `Date` or Unix ms.

### `todayKeyCairo(now?) → "YYYY-MM-DD"`

Today's date key in Cairo. The single canonical "what day is it"
helper. Pass `now` when you've already captured it (e.g.
`useState(() => Date.now())`); defaults to `Date.now()` otherwise.

### `tzWallClockToUtcMs(yyyymmdd, hhmm, tz?) → number`

Foundation primitive. Returns the UTC epoch ms for `${yyyymmdd}T${hhmm}`
interpreted as wall-clock time in `tz`. Uses the standard
"Intl-offset round-trip" technique — round-trip a naive UTC guess
through `Intl.DateTimeFormat` to discover the offset that actually
applies for that instant in that zone, then subtract.

Most other helpers in this module delegate to it.

### `cairoMidnightMs(dateKey, tz?) → number`

Thin wrapper around `tzWallClockToUtcMs(dateKey, "00:00")`. Provided
because "midnight ms for this Cairo date" is recurring across mood,
review, and quota windows; the alias reads better at the call site.

### `previousDateKey(dateKey, tz?)` / `nextDateKey(dateKey, tz?)`

Calendar day before / after `dateKey`. Both noon-anchored — going
noon-to-noon across a DST transition still lands inside the previous
/ next calendar day.

### `addDaysCairo(dateKey, days, tz?)`

Generalization of `previousDateKey` / `nextDateKey`. Negative `days`
walks backward. Short-circuits to the input when `days === 0`. One
`Intl` call per invocation regardless of magnitude.

### `weekdayOfDateKey(dateKey)` → `0 | 1 | … | 6`

JS-style weekday index (Sun=0 .. Sat=6). Calendar weekday is
timezone-independent for a fully-qualified date, so UTC-midnight
construction is correct here. Don't replace this with
`tzWallClockToUtcMs` — slower, same answer.

### `secondsUntilCairoMidnight(now?)` → `number`

Seconds until the next Cairo midnight from `now`. Floored to 60s so
a write landing at 23:59:59 doesn't get a 1-second TTL. Used as the
TTL bound for keys that should expire at the day boundary
specifically (none in current code — mood TTL was removed).

### `startOfCairoMonthMs(now?)` → `number`

UTC ms for the start of the current calendar month in Cairo.
DST-correct via `tzWallClockToUtcMs(YYYY-MM-01, "00:00")`. Used as
the lower bound for monthly quota windows in `permissions.ts`.

---

## Composition examples

### Walking a week (`getMoodHistory`)

```ts
const today = todayKeyCairo();
const dateStrings = Array.from({ length: 7 }, (_, i) =>
  addDaysCairo(today, -(6 - i)),
);
// → seven YYYY-MM-DD strings, oldest first, today last.
```

### Window bounds for a Sun→Sat review week (`weekRangeMs`)

```ts
const start = cairoMidnightMs(weekDate); // Sun 00:00
const nextSunday = addDaysCairo(weekDate, 7);
const end = cairoMidnightMs(nextSunday) - 1; // Sat 23:59:59.999
```

### Daily ritual window (`windowBoundsForCairoDate` in rituals.ts)

```ts
const opensAtMs = tzWallClockToUtcMs(dateKey, windowStart);
const closesAtMs = opensAtMs + durationMinutes * 60_000;
```

---

## What this module is NOT for

- **Display formatting.** "Wed, May 6", relative time, English month
  names — those go in components or `*-utils.ts`. This file is
  purely date-key construction and windowing math.
- **Per-feature semantics.** Ritual cadences, review week shape,
  quota windows — those go in their own modules and call into this
  one.

---

## Anti-patterns to refuse

- Reintroducing `todayInCairo()` or `secondsUntilMidnight()` as
  inline helpers in any file. They live here now.
- Hardcoded `+02:00` offset strings. Always wrong half the year.
- `new Date().toISOString().slice(0, 10)` for date keys. Server-local
  time, not Cairo.
- `setDate(d.getDate() - n)` for day arithmetic in date-key building.
  Server-local time. Use `addDaysCairo`.
- `toLocaleString` round-trip to construct a Date "in Cairo time."
  Produces a server-local-labeled Date that's only correct by accident.
