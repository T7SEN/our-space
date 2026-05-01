# Push Routing — FCM + Web Push

Detailed reference for the presence-aware push notification routing in Our Space. Load this when implementing or modifying any push path.

## The Six-Step Algorithm

Every code path that sends a notification (`sendPushToUser`, `sendRuleNotification`, `sendHugPush`, and any future addition) **must** follow this exact sequence. Deviations cause duplicate notifications, missing notifications, or crashes on no-GMS devices.

### Step 1 — Always write to history first

```ts
await pushNotificationToHistory(targetAuthor, {
  title: payload.title,
  body: payload.body,
  url: payload.url,
  timestamp: Date.now(),
});
```

History is the source of truth even if delivery fails. The `NotificationDrawer` reads from `notifications:{author}` (LIST, capped at 50) regardless of whether FCM or Web Push succeeded.

### Step 2 — Read presence

```ts
let currentPage: string | null = null;
try {
  const presenceRaw = await redis.get<string>(`presence:${targetAuthor}`);
  if (presenceRaw) {
    const { page, ts } = JSON.parse(presenceRaw) as {
      page: string;
      ts: number;
    };
    const ageMs = Date.now() - ts;
    if (ageMs < 12_000) {
      currentPage = page;
    }
  }
} catch (err) {
  logger.warn("[push] Presence check failed, proceeding:", { error: err });
}
```

The `12_000ms` threshold is intentional — it's wider than the 8s heartbeat interval in `usePresence` to absorb network jitter without over-extending.

The `presence:{author}` key has a Redis TTL of 6 seconds (`PRESENCE_TTL` in `src/app/api/presence/route.ts`). The TTL and the 12s freshness window together act as a two-layer expiry.

### Step 3 — Skip if recipient is on the target page

```ts
if (currentPage === payload.url) {
  logger.info(`[push] Skipping — ${targetAuthor} is on ${payload.url}.`);
  return;
}
```

The recipient sees the update via SSE (`/notes`) or the `useRefreshListener` hook on other pages. A push at this point would double-notify.

### Step 4 — Decide foreground vs background

```ts
const isAppOpen = currentPage !== null;
```

If presence exists at all, the app is foregrounded somewhere. If not, it's backgrounded or closed.

### Step 5 — FCM path (Android with GMS)

```ts
const fcmToken = await redis.get<string>(`push:fcm:${targetAuthor}`);
if (fcmToken) {
  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
      });
    }

    await getMessaging().send({
      token: fcmToken,
      ...(isAppOpen
        ? {
            // Foreground: data-only payload — Capacitor intercepts,
            // FCMProvider dispatches PushToast in-app.
            data: {
              url: payload.url,
              title: payload.title,
              body: payload.body,
            },
          }
        : {
            // Background/closed: full notification payload —
            // the OS draws the heads-up banner natively.
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: { url: payload.url },
            android: { priority: "high" },
          }),
    });
    return;
  } catch (err) {
    logger.error("[push] FCM failed, falling back to Web Push:", err);
  }
}
```

Critical detail: **the `notification` field must NOT be present in the foreground payload**. If it is, Android draws a system banner _and_ the in-app `PushToast` — the user sees the same message twice.

The `firebase-admin` SDK is imported dynamically. Top-level imports inflate the Edge bundle and break runtime detection.

### Step 6 — Web Push fallback (no GMS / PWA)

```ts
const subscription = await redis.get(`push:subscription:${targetAuthor}`);
if (!subscription) {
  logger.info(`[push] No subscription for ${targetAuthor}.`);
  return;
}

const webpush = (await import("web-push")).default;
webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);
await webpush.sendNotification(
  subscription as Parameters<typeof webpush.sendNotification>[0],
  JSON.stringify(payload),
);
```

This path is what reaches Besho's Honor device. The Service Worker (Serwist-generated `public/sw.js`) handles the `push` event and renders the system notification.

---

## Storage Keys

| Key                          | Type   | TTL  | Purpose                                |
| ---------------------------- | ------ | ---- | -------------------------------------- |
| `presence:{author}`          | STRING | 6s   | `{ page, ts }` JSON — heartbeat target |
| `push:fcm:{author}`          | STRING | none | FCM device token (Android with GMS)    |
| `push:subscription:{author}` | JSON   | none | Web Push subscription (PWA fallback)   |
| `notifications:{author}`     | LIST   | none | Last 50 records (LPUSH + LTRIM)        |

---

## Client Wiring

### `usePresence(page, paused?)`

`src/hooks/use-presence.ts`. Heartbeats `POST /api/presence` every 8 seconds with the current page. Calls `DELETE /api/presence` on unmount. Pause via the second arg when the user is idle (e.g., the tab is backgrounded but the device hasn't slept).

Every page that should suppress duplicate pushes when foregrounded must call `usePresence(currentRoute)`.

### `FCMProvider`

`src/components/fcm-provider.tsx`. Persistent in `layout.tsx` so registration survives navigation. Listens for:

- `registration` → `POST /api/push/subscribe-fcm` to store the token
- `registrationError` → log and continue (Honor/no-GMS)
- `pushNotificationReceived` → `dispatchPushToast` for the in-app toast
- `pushNotificationActionPerformed` → navigate to `data.url`

The notification channel is created with `importance: 4` and `visibility: 1` to keep the OS from drawing duplicate heads-up banners while the app is foregrounded.

### `PushToast`

`src/components/push-toast.tsx`. Portaled to `document.body`. Uses Web Audio API for the chime and `vibrate()` for haptics. Auto-dismisses after a fixed timeout; tap to navigate.

---

## Adding a New Push Path

Checklist for any new server action that needs to notify the partner:

1. Import `pushNotificationToHistory` from `@/app/actions/notifications`.
2. Determine the target author (the partner of `session.author`).
3. Build the payload `{ title, body, url }`.
4. Call `pushNotificationToHistory(target, { ...payload, timestamp: Date.now() })` first.
5. Run the presence check — if `currentPage === payload.url`, return.
6. Try FCM → fall back to Web Push. Wrap each in `try/catch` and log on failure.
7. Never throw out of a notification path. The originating user action must succeed regardless of push delivery.

Copy the `sendRuleNotification` function in `src/app/actions/rules.ts` as a template — it's the cleanest example.

---

## Failure Modes & Diagnostics

| Symptom                                     | Cause                                       | Fix                                         |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Duplicate banner + toast on Android         | `notification` field set in foreground path | Strip `notification` when `isAppOpen`       |
| No notification on Honor device             | FCM token absent (expected); no fallback    | Confirm `push:subscription:{author}` exists |
| Notifications stop after server restart     | Firebase Admin re-initialized               | Guard with `if (!getApps().length)`         |
| Push fires while user is on the target page | Presence stale or never written             | Check `usePresence(currentRoute)` is called |
| `FIREBASE_PRIVATE_KEY` parse error          | `\n` literals not converted                 | `.replace(/\\n/g, '\n')` at runtime         |

---

## Cross-References

- `src/app/actions/notes.ts` — `sendPushToUser`
- `src/app/actions/rules.ts` — `sendRuleNotification`
- `src/app/actions/mood.ts` — `sendHugPush`
- `src/app/actions/notifications.ts` — `pushNotificationToHistory`, `getNotificationHistory`, `markAllNotificationsRead`, `clearAllNotifications`
- `src/app/api/presence/route.ts` — presence write/delete
- `src/app/api/push/subscribe-fcm/route.ts` — FCM token store
- `src/components/fcm-provider.tsx` — client-side FCM lifecycle
- `src/components/push-toast.tsx` — in-app toast UI
- `src/hooks/use-presence.ts` — presence heartbeat
