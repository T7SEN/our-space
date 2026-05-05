# Redis (Upstash) — Data Model

Complete schema for the single Upstash Redis instance backing Our Space. There is no SQL/Prisma layer despite a stale `/src/generated/prisma` ignore entry — Redis is the sole datastore.

## Connection

Every server action and route handler that needs Redis instantiates it the same way:

```ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
```

The `KV_REST_API_*` naming is a Vercel KV legacy — the values point at Upstash. Don't rename without coordinated env-var updates on Vercel.

---

## Key Conventions

- **Flat namespace, colon-separated.** `note:{id}`, `notes:index`, `notes:count:T7SEN`. No nested objects in key names.
- **Author scoping** uses `T7SEN` or `Besho` literal — never `1`/`2` or `dom`/`sub`. The literal matches `session.author`.
- **Date-derived keys** use Cairo time (`MY_TZ` from `src/lib/constants.ts`) formatted `YYYY-MM-DD`. Never the server's local timezone.
- **Indexes are sorted sets (ZSET)** scored by `createdAt` (Unix ms). Pagination uses `zrange ... { rev: true }`.
- **Counters are atomic** via `INCR` / `DECR`.
- **Lists are capped** with `LTRIM` immediately after `LPUSH` to prevent unbounded growth.

---

## Notes (`/notes`)

| Key                        | Type   | TTL  | Description                                                                                |
| -------------------------- | ------ | ---- | ------------------------------------------------------------------------------------------ |
| `note:{id}`                | JSON   | none | `{ id, content, author, createdAt, editedAt?, originalContent?, pinned?, pinnedAt? }`       |
| `notes:index`              | ZSET   | none | All note IDs scored by `createdAt`                                                         |
| `notes:count:{author}`     | INT    | none | Per-author note count                                                                      |
| `notes:counts:initialized` | STRING | none | Migration sentinel — set after back-fill                                                   |
| `notes:pinned`             | SET    | none | Pinned note IDs (maintained for cleanup; `note.pinned`/`note.pinnedAt` are read-of-truth)  |
| `our-space-notes`          | LIST   | none | **Legacy** — drained on first read                                                         |
| `reactions:{noteId}`       | HASH   | none | `{ T7SEN: 'emojiLabel', Besho: 'emojiLabel' }`                                             |

### Pinning

- `MAX_PINS_PER_AUTHOR = 5` from `src/lib/notes-constants.ts`. Server enforces on the transition-to-pinned in `togglePinNote`: walks the index, counts the caller's currently-pinned notes via `mget`, refuses with `"You can pin up to 5 notes. Unpin one first."` if at cap.
- `pinnedAt` is set on pin and ignored when `pinned=false`. Used client-side for ordering within an author's pin group (newest pin first); falls back to `createdAt` for legacy records that pre-date the field.
- Render order on the client: T7SEN-pinned (newest pin first) → Besho-pinned (newest first) → unpinned (existing reverse-chronological).

### Pagination

```ts
const ids = (await redis.zrange(INDEX_KEY, start, start + PAGE_SIZE - 1, {
  rev: true,
})) as string[];
const notes = await redis.mget<(Note | null)[]>(...ids.map(noteKey));
```

`PAGE_SIZE = 20` from `src/lib/notes-constants.ts`. Reactions are merged in via `getReactionsForNotes()` before returning.

### Write pipeline

```ts
const pipeline = redis.pipeline();
pipeline.set(noteKey(note.id), note);
pipeline.zadd(INDEX_KEY, { score: note.createdAt, member: note.id });
pipeline.incr(countKey(author));
await pipeline.exec();
```

Always pipeline. Never issue these as separate awaits.

---

## Rules (`/rules`)

| Key           | Type | Description                                                                                                      |
| ------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `rule:{id}`   | JSON | `{ id, title, description?, status, createdBy, createdAt, acknowledgedAt?, completedAt?, acknowledgeDeadline? }` |
| `rules:index` | ZSET | Rule IDs scored by `createdAt`                                                                                   |

`status` is `'pending'` → `'active'` → `'completed'`. T7SEN can reopen completed rules — `reopenRule` strips `completedAt` and reverts to `'active'` (or `'pending'` if `acknowledgedAt` is also missing).

---

## Tasks (`/tasks`)

| Key           | Type | Description                                                                          |
| ------------- | ---- | ------------------------------------------------------------------------------------ |
| `task:{id}`   | JSON | `{ id, title, description?, status, createdBy, createdAt, deadline?, completedAt? }` |
| `tasks:index` | ZSET | Task IDs scored by `createdAt`                                                       |

T7SEN creates. Besho completes.

---

## Ledger (`/ledger`)

| Key            | Type | Description                                                          |
| -------------- | ---- | -------------------------------------------------------------------- |
| `ledger:{id}`  | JSON | `{ id, type, category, title, description?, occurredAt, createdAt }` |
| `ledger:index` | ZSET | Entry IDs scored by `occurredAt`                                     |

`type` is `'reward'` or `'punishment'`. Categories defined in `src/lib/ledger-constants.ts`. T7SEN-only writes; both can read.

---

## Permissions (`/permissions`)

| Key                                 | Type   | TTL    | Description                                                            |
| ----------------------------------- | ------ | ------ | ---------------------------------------------------------------------- |
| `permission:{id}`                   | JSON   | none   | `PermissionRequest` record (see `references/permissions.md` for shape) |
| `permissions:index`                 | ZSET   | none   | Permission IDs scored by `requestedAt`                                 |
| `permission:reask-block:{bodyHash}` | STRING | varies | Set on denial; cooldown TTL from `DENIAL_REASON_COOLDOWN_HOURS`        |
| `permission:audit:{id}`             | LIST   | none   | Prior decision states. LPUSH'd on re-decide. Capped 20 via `LTRIM`     |
| `permissions:denied-hashes`         | SET    | none   | Body hashes ever denied. Drives the ↺ chip ("Asked again")             |
| `permissions:quotas`                | JSON   | none   | `{ monthlyLimits: {...}, maxPending? }` — single key, Sir-only writes  |
| `permissions:auto-rules`            | JSON   | none   | Ordered array of `AutoDecideRule`. Sir-only readable AND writable      |

### Distinct re-ask mechanisms

The two re-ask keys do different jobs and shouldn't be conflated:

- `permission:reask-block:{bodyHash}` — TTL'd. **Rejects** new requests during cooldown.
- `permissions:denied-hashes` — no TTL. **Marks** new requests with `wasReasked: true` for the ↺ chip; never rejects.

Both are populated together when Sir denies a request (manual or auto). The block expires; the SET membership is forever.

### Body hash function

`bodyHashFor(body)` lowercases, trims, collapses whitespace, then runs FNV-style integer hash to base36. Trivial rewordings (case changes, extra spaces) collide deliberately. Semantic rewording bypasses both mechanisms.

### Quota window

`startOfCairoMonthMs()` uses `Intl.DateTimeFormat` with `Africa/Cairo`, fixed `+02:00` offset. DST-day drift is acceptable for monthly windows. Quota check is on-the-fly: ZRANGE month-window, pipelined GET, filter to approved + matching category. O(N) scan over month records — fine at this scale.

### Audit log

`permission:audit:{id}` captures the OLD state on every re-decide BEFORE overwrite. First decisions (pending → decided) don't log. `getPermissions` pipelines `LLEN` for each record alongside the `GET` to surface `auditCount` in one round-trip.

### Auto-rule privacy

`getAutoRules` returns `[]` for Besho. Rules are Sir's private authoring artifacts. The visible `decidedByRuleId` on Besho's cards renders only an "Auto" chip — no rule details exposed.

Full feature spec, validation order, and decision routing: `references/permissions.md`.

---

## Mood (`/`)

| Key                           | Type   | TTL | Description                     |
| ----------------------------- | ------ | --- | ------------------------------- |
| `mood:{YYYY-MM-DD}:{author}`  | STRING | 7d  | Daily mood emoji label          |
| `state:{YYYY-MM-DD}:{author}` | STRING | 7d  | Daily dom/sub state label       |
| `mood:hug:{date}:{from}`      | STRING | 7d  | Set to `'1'` when a hug is sent |

The 7-day TTL exists so `getMoodHistory()` can backfill the past week's grid. The daily view in `MoodCard` reads only today's keys. TTL renewal happens implicitly on each write.

`secondsUntilMidnight()` (Cairo time) is used for keys that should expire at the day boundary specifically.

---

## Presence (`/api/presence`)

| Key                 | Type   | TTL | Description                                       |
| ------------------- | ------ | --- | ------------------------------------------------- |
| `presence:{author}` | STRING | 6s  | `JSON.stringify({ page, ts })` — heartbeat anchor |

Written every 8 seconds by `usePresence` while a page is open. The 6-second TTL ensures stale entries auto-clean if the heartbeat stops. Push routing additionally enforces a 12-second freshness window to absorb network jitter.

`DELETE /api/presence` is called on `usePresence` cleanup to immediately invalidate (rather than waiting for TTL).

---

## Push Tokens

| Key                 | Type   | Description                |
| ------------------- | ------ | -------------------------- |
| `push:fcm:{author}` | STRING | FCM device token (Android) |

> **Removed:** `push:subscription:{author}` (Web Push subscription) is no longer used. PWA infrastructure was removed; Web Push delivery is gone. If your Redis still has these keys from the old codebase, drop them:
>
> ```
> DEL push:subscription:T7SEN push:subscription:Besho
> ```

Both devices register an FCM token on app launch. `FCMProvider` catches any registration error and continues silently (see Section 3.3 of `AGENTS.md`), so consumers must still treat `push:fcm:{author}` as nullable.

---

## Notifications

| Key                      | Type | Description                                            |
| ------------------------ | ---- | ------------------------------------------------------ |
| `notifications:{author}` | LIST | `NotificationRecord` objects, capped at 50 via `LTRIM` |

`NotificationRecord = { id, title, body, url, timestamp, read }`. Newest first (LPUSH). The `NotificationDrawer` reads via `LRANGE 0 49`.

`markAllNotificationsRead()` rewrites the entire list with `read: true` — this is a known O(n) operation but n ≤ 50 so it's fine.

This list is the durable artifact when FCM delivery is unavailable for any reason — both users see missed notifications next time they open the app.

---

## Safe Word

| Key                          | Type   | TTL  | Description                                  |
| ---------------------------- | ------ | ---- | -------------------------------------------- |
| `safeword:cooldown:{author}` | STRING | 5min | Set when Besho triggers; blocks re-trigger   |
| `safeword:history`           | LIST   | none | All safe-word events (T7SEN-only visibility) |

The 5-minute cooldown is enforced server-side. The cooldown bypasses the presence check entirely — safe-word notifications **always** fire regardless of where T7SEN is.

---

## Birthday & Counters

| Key                  | Type   | Description                    |
| -------------------- | ------ | ------------------------------ |
| `relationship:start` | STRING | ISO date for the `CounterCard` |
| `birthday:T7SEN`     | STRING | ISO date                       |
| `birthday:Besho`     | STRING | ISO date                       |

These are read-only from the app's perspective — set manually via redis-cli or a one-off script.

---

## Sir-Only Admin Surfaces

Every namespace below is read or written exclusively by `src/app/actions/admin.ts` (Sir-only via `requireSir()`) plus the helpers in `src/lib/trash.ts`, `src/lib/activity.ts`, and `src/lib/auth-utils.ts`.

### Trash (soft-delete window)

| Key                       | Type   | TTL    | Description                                                          |
| ------------------------- | ------ | ------ | -------------------------------------------------------------------- |
| `trash:{feature}:{id}`    | STRING | 7 days | JSON `TrashEntry` — payload + indexScore + recordKey + indexKey      |
| `trash:index`             | ZSET   | none   | Global index, score = `deletedAt` ms, member = `{feature}::{id}`     |
| `trash:index:{feature}`   | ZSET   | none   | Per-feature index, score = `deletedAt` ms, member = `id`             |

`{feature}` is one of `notes` / `rules` / `tasks` / `ledger` / `permissions` / `rituals` / `timeline` / `reviews` (from `TrashFeature` in `src/lib/trash.ts`).

`TrashEntry` shape (also in `src/lib/trash.ts`):

```ts
interface TrashEntry {
  feature: TrashFeature
  id: string
  label: string          // human-readable preview shown on /admin/trash
  deletedAt: number
  deletedBy: Author
  payload: unknown       // original JSON of the primary record
  indexScore: number     // original score in the feature's index ZSET
  recordKey: string      // e.g. note:{id}
  indexKey: string       // e.g. notes:index
  extraRecords?: { key: string; value: unknown }[]  // additional records (used by reviews — Besho's record sits here)
}
```

**What restore re-creates:** the primary record JSON at `recordKey`, the `extraRecords` (if any), and the index ZSET entry at `(indexKey, indexScore, id)`.

**What restore does NOT re-create** (intentionally lost):

- Notes: reactions (`reactions:{id}`), pinned-set membership (`notes:pinned`), per-author counts (`notes:count:{author}`).
- Permissions: audit log (`permission:audit:{id}`), quotas, auto-rules, denied-hashes (only the `purgeAllPermissions` path nukes those).
- Rituals: occurrence index + per-date occurrence keys, current/longest streak.
- Reviews: only T7SEN's record is in `payload`; Besho's lives in `extraRecords[0]`. The composite trash entry restores both.

The 7-day TTL lives on the per-record JSON key. Index ZSET members are tombstones swept on read by `listTrash` (entries with `mget = null` get `zrem`'d in a best-effort pipeline).

For features with composite IDs, the `TrashEntry.id` joins parts with `:` (e.g. `2026-04-27` for a review week). The global `trash:index` member uses `::` between feature and id to avoid collision with `:`-containing ids.

### Activity feed

| Key            | Type | Cap                  | Description                                         |
| -------------- | ---- | -------------------- | --------------------------------------------------- |
| `activity:log` | ZSET | 500 entries          | score = `Date.now()`, member = JSON `ActivityRecord` |

`ActivityRecord = { at, level, message, context? }`. Levels written: `interaction`, `warn`, `error`, `fatal` (driven from `logger.ts`). Trimmed via `zremrangebyrank("activity:log", 0, -501)` after each write. Read newest-first via `zrange ... { rev: true }` in `getActivity()`.

### Session epoch (force-logout)

| Key                      | Type   | Description                                                              |
| ------------------------ | ------ | ------------------------------------------------------------------------ |
| `session:epoch:{author}` | STRING | Unix ms timestamp of last revoke. Absent / `0` means no revoke ever issued. |

`decrypt()` reads this on every JWT verify (5-second in-process cache per process). If JWT `iat * 1000 < epoch` → reject. Bumped via `revokeAuthorSessions(author)` which writes `Date.now()`. Existing JWTs without bumped epoch remain valid.

---

## Migration Sentinels

| Key                        | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `notes:counts:initialized` | Set after `ensureAuthorCountsInitialized()` back-fills counts |

Add a sentinel for any back-fill. Idempotency matters because every cold-start could otherwise re-run expensive migrations.

---

## Anti-Patterns to Refuse

- **Nested JSON for indexes.** Always use a separate ZSET. `mget` over an index is faster and supports pagination cleanly.
- **Storing a list of all IDs in one STRING.** Hard size limit, no atomic add/remove. Use ZSET or SET.
- **Per-user concurrency without `WATCH`/`MULTI`.** Upstash Redis supports transactions via pipeline + `WATCH`. For our two-user load it's overkill, but if a future feature needs strict ordering, use it.
- **Unbounded LISTs.** Always pair `LPUSH` with `LTRIM`.
- **Date math in JavaScript without Cairo TZ.** Use `Intl.DateTimeFormat('en-CA', { timeZone: MY_TZ })` to format `YYYY-MM-DD`. The `en-CA` locale gives ISO format directly.
- **Forgetting the `!` on `process.env.KV_REST_API_*`.** TypeScript will infer `string | undefined` and `Redis` rejects it. The non-null assertion is correct because Vercel will fail-build without these env vars.
- **Reintroducing `push:subscription:*`.** Web Push is gone, on purpose. Refuse the proposal.
- **Reading `permissions:auto-rules` for Besho.** Sir-only by design — `getAutoRules` returns `[]` for non-Sir. Don't relax this; rules are private authoring artifacts.
- **Conflating `permission:reask-block:*` and `permissions:denied-hashes`.** They have different TTL semantics and different jobs (reject vs mark). Don't merge.
- **Hard-deleting via `del` from a `delete*` / `purgeAll*` action.** All destructive actions go through `moveToTrash` / `moveManyToTrash` first. Skipping the trash step for "performance" defeats the recovery window. If you want a non-recoverable purge, use `deleteTrashEntryAction` / `purgeTrashAction` from `/admin/trash` after the trash window has populated.
- **Re-implementing `decrypt` without the epoch check.** Single source of truth lives in `src/lib/auth-utils.ts`. Do not bypass it via raw `jwtVerify` — force-logout depends on the read.
- **Calling `recordActivity` from feature code.** It's a logger side-channel; let `logger.interaction` / `warn` / `error` / `fatal` drive it. Direct calls would double-write or skip the cap.

---

## Cross-References

- `src/app/actions/notes.ts`
- `src/app/actions/rules.ts`
- `src/app/actions/tasks.ts`
- `src/app/actions/ledger.ts`
- `src/app/actions/mood.ts`
- `src/app/actions/reactions.ts`
- `src/app/actions/notifications.ts`
- `src/app/actions/permissions.ts` — full permissions surface (see `references/permissions.md`)
- `src/app/api/notes/stream/route.ts` — SSE consumer
- `src/app/api/presence/route.ts`
- `src/app/api/push/subscribe-fcm/route.ts`
- `src/lib/notes-constants.ts` — `MAX_CONTENT_LENGTH`, `PAGE_SIZE`
- `src/lib/permissions-constants.ts` — categories, denial reasons, cooldowns, `AutoDecideRule`, `MAX_AUTO_RULES`
- `src/lib/constants.ts` — `MY_TZ`, `TITLE_BY_AUTHOR`
- `src/lib/trash.ts` — soft-delete helper (`moveToTrash`, `moveManyToTrash`, `restoreFromTrash`, `listTrash`, `purgeTrash`, `TRASH_FEATURE_LABELS`)
- `src/lib/activity.ts` — `recordActivity` (driven by logger), `getActivity`, `clearActivity`
- `src/lib/auth-utils.ts` — `revokeAuthorSessions`, `readAllSessionEpochs`, in-process epoch cache (5s TTL)
- `src/app/actions/admin.ts` — every Sir-only admin surface call (inspector, push test, sessions, export, trash list/restore/purge, activity feed)
