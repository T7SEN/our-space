# Things That Do Not Exist — Anti-Hallucination Inventory

This file mirrors `SKILL.md` Section 2. Loaded on demand by tools that read reference files but not the skill body. Always cross-check before writing imports or env-var references.

---

## Removed Dependencies

| Removed / nonexistent                                                                                                                                         | Replacement                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@serwist/next`, `@serwist/sw`, `serwist`, `workbox-*`                                                                                                        | None — PWA removed                                                                      |
| `web-push` package, `VAPID_*` env vars                                                                                                                        | None — Web Push removed                                                                 |
| `navigator.serviceWorker`, `sw.register()`, `public/sw.js`, `public/manifest.json`                                                                            | None                                                                                    |
| `src/lib/offline-notes.ts`, `storePendingNote`, `getPendingNotes`, `removePendingNote`, `PendingNote`                                                         | None — IndexedDB queue removed                                                          |
| `/api/notes/sync` endpoint                                                                                                                                    | None — only `/api/notes/stream` (SSE) exists in `notes/api/`                            |
| `push:subscription:{author}` Redis key                                                                                                                        | `push:fcm:{author}` only                                                                |
| `prisma`, `@prisma/client`, SQL migrations                                                                                                                    | Upstash Redis is the sole datastore; `/src/generated/prisma` is a stale gitignore entry |
| Light-mode Tailwind variants                                                                                                                                  | Dark theme is forced via `forcedTheme="dark"`                                           |
| `tailwind.config.ts` / `tailwind.config.js`                                                                                                                   | Tailwind v4 is CSS-first; tokens live in `src/app/globals.css`                          |
| `pages/` directory, `getServerSideProps`, `getStaticProps`                                                                                                    | App Router only                                                                         |
| `VoiceNote` type, `voiceNote` field on `PermissionRequest`, `MediaRecorder` usage in permissions, `RECORD_AUDIO` Android permission, `VOICE_NOTE_*` constants | None — voice notes were prototyped on permissions and explicitly removed                |

---

## Why This File Exists

Training data for current LLMs predates several intentional removals from this codebase. Common autocompletion failures:

- Importing `web-push` because the agent saw a notification helper and pattern-matched on Web Push tutorials.
- Writing `import { Serwist } from '@serwist/next'` because the agent inferred PWA support from the Capacitor presence.
- Referencing `process.env.VAPID_PUBLIC_KEY` because the agent assumed Web Push must be configured.
- Reading from `pages/api/...` because the agent's training cutoff predates App Router maturity.
- Re-suggesting voice notes for `/permissions` because audio attachments seem like a natural fit for emotional context. They were prototyped and removed — don't re-propose without explicit user instruction.

Every entry above produces a runtime failure, a bundle that won't compile, or a refused PR. Stop the moment you find yourself typing one.

---

## Easy mistakes that aren't on the removed list

These are not removed — they exist and are wired up. Listed because their existence is non-obvious and an agent might assume the wrong thing:

- **`@capacitor/geolocation`** is in use, not dormant. `DistanceCard` consumes it for live distance to `PARTNER_COORDS`. The `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` perms in `AndroidManifest.xml` are real, not stale.
- **`@capacitor/device`** is in use for Sentry device context inside `SentryUserProvider`. Don't propose adding device-info plugins; one already runs.
- **`@capacitor/screen-orientation`** IS still installed but currently unused — flagging here so an agent doesn't mistake it for a future-use plugin already wired up. Either propose a real use or removal.
- **`/admin`** is a real Sir-only sub-tree (not a stub). Routes: `/admin`, `/admin/trash`, `/admin/export`, `/admin/inspector`, `/admin/push-test`, `/admin/activity`, `/admin/sessions`. Layout guard at `src/app/admin/layout.tsx` redirects non-Sir; every action in `src/app/actions/admin.ts` repeats the role check via `requireSir()`.
- **`moveToTrash` / `moveManyToTrash`** are real and wired into every `delete*` / `purgeAll*` action. Don't propose "adding a trash window" as future work — it exists. Don't bypass via a raw `del` either.
- **`session:epoch:{author}`** is the live force-logout mechanism. `decrypt()` reads it on every JWT verify (5s in-process cache). Don't reinvent revocation via deny-lists or jti-tracking.
- **`activity:log`** is the Sir-only feed. Driven automatically from `logger.interaction` / `warn` / `error` / `fatal` via `recordActivity` in `src/lib/activity.ts`. Don't call `recordActivity` directly from feature code.
- **`summonKitten()`** is real and lives in `src/app/actions/admin.ts`. It is the only Sir → Besho push that bypasses presence and uses the safeword channel. Surfaced via `<SummonButton>` on the `/admin` landing. Don't propose adding a cooldown, history list, or configurable copy without explicit instruction — those were all considered and rejected.

---

## Cross-References

- `SKILL.md` Section 2 — same table, mirrored for the skill-loading path
- `AGENTS.md` Section 2 — high-level reminder
- `references/deployment.md` — env var list (no `VAPID_*`)
- `references/redis-schema.md` — key list (no `push:subscription:*`)
