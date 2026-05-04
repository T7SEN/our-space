# Review (`/review`)

Weekly retrospective. Both authors write four reflections
independently; nothing reveals until both have submitted, then the
record is locked and rendered side-by-side. Driven by the same
asymmetry-protecting design as the rest of the app — no nudging,
no submission pressure, no peeking before reveal.

---

## Concept

Each review is a Sunday-anchored bucket. Both authors fill four
free-form fields. The record reveals atomically once both have
submitted; until then, neither side sees the other's content. An
auto-summary panel sits beside the form aggregating mood, hugs,
rules, tasks, ledger, permissions, notes, and safe-word data for the
reviewed week — context on screen while writing.

The four fields:

1. **What worked** — wins, moments of connection (rich-text editor).
2. **What didn't** — where the week fell short (rich-text editor).
3. **Friction points** — concrete frictions, one per line (textarea).
4. **Goals for next week** — concrete goals, one per line (textarea).

All four render through `MarkdownRenderer` on reveal regardless of
input mode — plain-textarea fields still get GFM if the writer used
it.

---

## Week shape and submission window

- **Reviewed period:** Sunday 00:00 → Saturday 23:59:59.999 Cairo.
  Identified by the **starting Sunday** date key (e.g.
  `review:2025-11-02:T7SEN` covers Sun Nov 2 → Sat Nov 8).
- **Submission window:** Saturday 00:00 → Sunday 23:59:59.999 Cairo
  of the week ending the reviewed period — 48 hours straddling
  week-end.
- **Hard cutoff:** Monday 00:00 Cairo. After that, the week is
  permanently locked. New "current review" rolls to next week's
  starting Sunday the following Saturday.
- **Orphan handling:** if only one author submitted by cutoff, the
  record stays in storage but never reveals. Visible only to its
  author via the closed-card path. Partner cannot retroactively
  submit; the week is gone.

Why 48 hours and not strict-Sunday-only:

- Ritual framing preserved (Sunday night still the canonical time).
- Saturday-evening early submission accommodates the planner half of
  the couple.
- One missed Sunday doesn't kill the practice — Saturday still works.
- 48 hours is short enough that retrospectives stay close to the
  reviewed week.

Week math is in `src/lib/review-utils.ts`, sourced from
`@/lib/cairo-time`.

---

## Storage

| Key                                          | Type | TTL  | Description                                                                                    |
| -------------------------------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------- |
| `review:{startingSundayYYYY-MM-DD}:{author}` | JSON | none | `{ id, weekDate, author, whatWorked, whatDidnt, friction, goalsNext, submittedAt, editedAt? }` |
| `reviews:revealed`                           | ZSET | none | Member = startingSundayYYYY-MM-DD; score = revealedAt ms. Drives history.                      |

`submittedAt` preserves the original submission ms across edits.
`editedAt` is updated on every pre-reveal edit. Once the week is a
member of `reviews:revealed`, the record is permanently locked
(server-enforced, UI is informational only).

Date format `YYYY-MM-DD` matches the `mood:*` convention. ~30KB per
revealed week worst-case (4000 chars × 4 fields × 2 authors plus
envelope). Negligible at any scale this app reaches.

---

## State machine

`/review` resolves to one of five states:

| State        | Condition                                         | UI                                  |
| ------------ | ------------------------------------------------- | ----------------------------------- |
| Skeleton     | Initial fetch in flight                           | Spinner card                        |
| Reveal       | Week is in `reviews:revealed`, both records exist | `RevealCard` side-by-side           |
| Edit         | Own record exists, window open, edit-mode toggled | `ReviewForm` with `existing` prop   |
| Pending      | Own record exists, window open or just closed     | `PendingCard` (waiting / sealed)    |
| First-submit | No own record, window open                        | `ReviewForm` with `existing = null` |
| Closed       | No own record, window closed                      | `ClosedCard`                        |

The state router lives in `src/app/review/page.tsx::StateCard`.

`PendingCard` polls every 15s (visibility-aware) — partner-submit
transitions the view to revealed without requiring a manual refresh.
Polling stops when the window closes.

Past-week deep-links (`/review?week=YYYY-MM-DD`) re-use the same
state machine. Past revealed weeks land in the reveal branch; past
unrevealed weeks land in `ClosedCard`.

---

## Race-free reveal

`submitReview` uses pipelined SET-then-GET followed by `ZADD nx`:

1. Auth + role check (both authors allowed).
2. Field validation: lengths (`MAX_FIELD_LENGTH = 4000` per field),
   at-least-one-non-empty.
3. Resolve `weekDate` server-side. Never trust client.
4. Pre-write gate: `ZSCORE reviews:revealed weekDate` non-null →
   reject with "already revealed and locked."
5. Pipeline: `SET review:{weekDate}:{author}` + `GET review:{weekDate}:{partner}`.
6. If partner record exists, attempt `ZADD reviews:revealed
{ score: now, member: weekDate, nx: true }`.
   - Returns `1` → we won the reveal race. Fan out reveal push to
     both authors.
   - Returns `0` → partner already triggered reveal. Silent.

The single member of `reviews:revealed` ensures only one push fires
even if both authors submit within the same millisecond.

Edits are allowed pre-reveal — the SET overwrites freely. Edits
post-reveal hard-fail at the gate.

---

## Push notifications

Three push paths total per fully-completed week:

| Trigger                               | Recipient    | Body                                                             |
| ------------------------------------- | ------------ | ---------------------------------------------------------------- |
| First submission (partner hasn't yet) | Partner only | "Reflection waiting — `{author}` submitted theirs for `{label}`" |
| Second submission (reveals)           | Both authors | "Review revealed — both reflections for `{label}` are ready"     |

No push on edits. The `!existing` guard in `submitReview` ensures the
"reflection waiting" push fires only on the original submission, not
on subsequent edits.

No window-open or window-closing pushes. The asymmetry-protecting
design treats those as nudging, not informational. See refusal
catalog.

The "partner submitted" push uses `TITLE_BY_AUTHOR` for the body
copy — never hardcode `Sir`/`kitten`.

---

## Auto-summary panel privacy invariants

`getReviewWeekSummary` aggregates existing data for the reviewed
week and renders alongside the writing surface. Two privacy rules:

1. **Permissions** are status counts only — `submitted`, `approved`,
   `denied`, `queued`, `withdrawn`. Never `decidedByRuleId`, never
   auto-rule attribution. The Sir-private invariant for
   `permissions:auto-rules` extends into summaries.
2. **Safe-word `timestamps`** array is gated on
   `viewer === "T7SEN"`. Both authors see the `triggered` count
   (it's Besho's own action either way). Only Sir sees the
   per-trigger timestamps.

---

## Edit-vs-reveal lock

Edits are permitted any time within the submission window before
reveal. The race window (T7SEN edits exactly as Besho's submit
reveals) is acceptable for two-user load — last write before
`ZADD nx` wins, edits after the ZADD hard-fail with "already
revealed."

No `WATCH`/`MULTI`. Cost is overkill for the threat model.

---

## What `/review` is NOT

- **Not threaded.** No comments, no replies on the partner's
  reflection. Discussion goes in notes.
- **Not nudging.** No window-open reminder push, no
  unsubmitted-week badge in the navbar. Saturday-night ritual is a
  thing you choose, not a chore the app reminds you about.
- **Not AI-assisted.** No LLM summaries or suggestions. The
  reflection has to come from you.
- **Not exportable.** No PDF, no email, no sharing link.
- **Not bypassable for past weeks.** A missed window stays missed.
  Orphan records are private to their author and never reveal.

---

## File layout

```
src/app/review/page.tsx                              State router
src/app/actions/reviews.ts                           Server actions
src/lib/review-constants.ts                          Types + field metadata
src/lib/review-utils.ts                              Cairo-aware week math
src/components/review/review-form.tsx                Composition surface
src/components/review/pending-card.tsx               Post-submit waiting
src/components/review/reveal-card.tsx                Side-by-side reveal
src/components/review/week-summary-panel.tsx        Aggregate readout
src/components/review/history-drawer.tsx            Past revealed weeks
```

Server actions exported from `reviews.ts`:

- `submitReview(prevState, formData)` — both authors. Upsert + maybe-reveal.
- `getReviewBundle(weekDate?)` — single round-trip page-load fetch.
- `getMyReview(weekDate?)` — caller's own record.
- `getRevealedReview(weekDate)` — both records iff in `reviews:revealed`.
- `getPartnerSubmissionStatus(weekDate?)` — boolean only.
- `getReviewWeekSummary(weekDate?)` — aggregate.
- `getRevealedHistory(limit?)` — past revealed weeks.
