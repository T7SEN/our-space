# Capacitor & Native Handling

Reference for Capacitor 8 integration, Android-specific concerns, the no-GMS graceful degradation path, and the BiometricGate component.

## Platform Detection

`src/lib/native.ts` — the **only** sanctioned platform check. Don't sniff user agents, don't check `window.matchMedia`, don't probe for `Capacitor` directly.

```ts
import { isNative } from "@/lib/native";

if (isNative()) {
  // Capacitor plugin path
} else {
  // PWA/web fallback
}
```

The implementation:

```ts
interface GlobalWithCapacitor {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
}

export const isNative = (): boolean => {
  if (typeof globalThis === "undefined") return false;
  const cap = (globalThis as unknown as GlobalWithCapacitor).Capacitor;
  return typeof cap !== "undefined" && cap.isNativePlatform?.() === true;
};
```

Note the `globalThis as unknown as { ... }` pattern — this is the canonical browser-globals access pattern across the entire codebase.

---

## Plugin Matrix

All Capacitor plugins are imported **dynamically** to keep the PWA bundle slim. Top-level imports inflate the Edge bundle and break runtime detection.

| Plugin                                | Used in                                 | Purpose                                                   |
| ------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| `@aparajita/capacitor-biometric-auth` | `BiometricGate`                         | Fingerprint / Face Unlock unlock                          |
| `@capacitor/preferences`              | `BiometricGate`, login flow             | Persistent key-value (replaces localStorage on native)    |
| `@capacitor/push-notifications`       | `FCMProvider`                           | FCM token + foreground/tap listeners                      |
| `@capacitor/local-notifications`      | `useLocalNotifications`                 | Offline reminders for task/rule deadlines                 |
| `@capacitor/haptics`                  | `vibrate()` in `src/lib/haptic.ts`      | Native vibration via Android API                          |
| `@capacitor/clipboard`                | `writeToClipboard`, `readFromClipboard` | Works without WebView focus, unlike `navigator.clipboard` |
| `@capacitor/app`                      | `BiometricGate`, `CapacitorInit`        | App lifecycle (`appStateChange`)                          |
| `@capacitor/keyboard`                 | `useKeyboardHeight`                     | Keyboard show/hide events for layout adjustment           |
| `@capacitor/network`                  | `CapacitorInit`                         | Network status (online/offline)                           |
| `@capacitor/status-bar`               | `CapacitorInit`                         | Tint and visibility                                       |
| `@capacitor/splash-screen`            | `CapacitorInit`                         | Hide on app ready                                         |
| `@capawesome/capacitor-badge`         | Badge updates                           | App icon badge count                                      |

### Dynamic import pattern

```ts
if (isNative()) {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (err) {
    logger.error("[haptic] Capacitor haptics failed:", err);
  }
}
```

Always wrap in `try/catch`. Plugin failures must never crash the calling code path.

---

## No-GMS Graceful Degradation (Honor Device)

Besho's Honor phone and tablet have **no Google Mobile Services**. Anything that depends on Google Play APIs will fail. The codebase handles this in three places:

### 1. FCMProvider — `src/components/fcm-provider.tsx`

```ts
const errorListener = await PushNotifications.addListener(
  "registrationError",
  (err) => {
    logger.warn(`[fcm] Registration error for ${author} (Likely No GMS):`, {
      error: err,
    });
  },
);
```

The error is **caught and logged**. It does not throw. The app continues to function — Web Push picks up the slack.

### 2. Push routing fallback

If `push:fcm:{author}` is empty in Redis (because FCM registration failed), the routing in [`push-routing.md`](./push-routing.md) falls through to `push:subscription:{author}` (Web Push via VAPID). The Service Worker handles the `push` event and renders a system notification.

### 3. Never assume an FCM token exists

Server-side code that touches the FCM path must always `await redis.get<string>(`push:fcm:${author}`)` and check for null. Treat the absence as expected, not exceptional.

---

## BiometricGate

`src/components/biometric-gate.tsx`. The fullscreen lock overlay and the primary unlock mechanism on native.

### Invariants

- Renders above all routes **except** `UNGUARDED_ROUTES` (currently the login route).
- Web/desktop falls through immediately — `isNative()` → `false` → state set to `'unavailable'` and children render.
- Reads `biometric_enrolled` from `@capacitor/preferences` to decide whether to prompt on cold start.
- `last_unlocked_at` (also in Preferences) gates a **cold-start grace period** — if the user unlocked recently, skip the prompt to avoid annoying loops.
- `appStateChange` listener re-locks after `LOCK_AFTER_MS` of background time.

### The Knox/Honor Double-Prompt Loop

Samsung Knox and Honor's biometric subsystem fire a redundant `appStateChange` event 0–500ms after the auth prompt closes. Without protection, this triggers a second prompt immediately after the first dismissal.

The fix:

```ts
const lastAuthEndedAtRef = useRef<number>(0);

// In appStateChange handler:
if (Date.now() - lastAuthEndedAtRef.current < 2000) return;
```

A 2-second debounce window absorbs the spurious event. **Do not remove this ref.** It looks redundant. It is not.

### State machine

```
checking → (native?) ↘
                     locked → prompting → unlocked
                                       ↘ locked (failed)
checking → (web?) → unavailable
```

`gateState` transitions:

- `'checking'` → initial
- `'locked'` → ready to prompt or already failed
- `'prompting'` → biometric dialog open
- `'unlocked'` → children render
- `'unavailable'` → web fallthrough or no biometry on device

### Failure handling

After `MAX_AUTO_FAILURES` consecutive failures, the gate offers a "Use Password" fallback (`authError === 'use_password'`) which routes to the password login flow.

---

## Build Pipeline

### Web

Vercel builds the Next.js app on push to `main`. Standard pipeline — nothing Capacitor-specific.

### Android

```bash
pnpm build              # Next.js production build
npx cap sync android    # Copy web assets into android/app/src/main/assets/public
```

Then build the APK from Android Studio. The `android/` directory is **gitignored** — it's regenerated locally from `capacitor.config.ts`.

### Capacitor config

```ts
const config: CapacitorConfig = {
  appId: "me.t7senlovesbesho", // PERMANENT — Play Store identity
  appName: "Our Space", // Display name on home screen
  webDir: "out",
};
```

**Never change `appId`.** It's the device-side primary key for installs, biometric enrollment, FCM tokens, and Preferences storage. Changing it creates a new "app" on every existing device.

`appName` is what the user reads — change freely.

---

## Keystore

`C:\Users\T7SEN\keys\ourspace.jks`. Used to sign release APKs.

- **Never commit** the keystore or its passwords to the repo or any `.env*` file.
- **Never log** the passwords.
- Keep an offline backup. Losing the keystore means losing the ability to publish updates without forcing every user to uninstall and reinstall.

---

## Versioning

`android/app/build.gradle`:

```gradle
defaultConfig {
	applicationId "me.t7senlovesbesho"
	versionCode 14    // bump for every release
	versionName "1.4.0"  // human-readable
}
```

`versionCode` must increase monotonically. `versionName` should track `package.json`'s `version` field.

---

## Service Worker

Serwist generates `public/sw.js` and `public/sw-*.js` at build time. These files are gitignored. The service worker:

- Handles offline routing for the PWA path
- Receives Web Push events on Honor (no FCM)
- Renders system notifications via `self.registration.showNotification`

When debugging service worker issues, force-update via Chrome DevTools → Application → Service Workers → Update / Unregister, then reload.

---

## Cross-References

- `src/lib/native.ts` — `isNative()`
- `src/lib/haptic.ts` — `vibrate()`
- `src/lib/clipboard.ts` — `writeToClipboard`, `readFromClipboard`
- `src/components/biometric-gate.tsx`
- `src/components/fcm-provider.tsx`
- `src/components/capacitor-init.tsx`
- `src/hooks/use-local-notifications.ts`
- `src/hooks/use-keyboard.ts`
- `capacitor.config.ts` (root)
