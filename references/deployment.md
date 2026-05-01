# Deployment

Reference for Vercel (web) and Android (Capacitor) deployment pipelines, environment variables, secrets, and verification.

## Topology

```
GitHub (t7sen/our-space)
    │
    ├──→ Vercel ──→ https://t7senlovesbesho.me      (web, PWA, API routes, Edge SSE)
    │
    └──→ Local clone ──→ pnpm build ──→ npx cap sync android
                              │
                              └──→ Android Studio ──→ signed APK ──→ devices
```

The web and Android builds share the same `src/` and produce different artifacts. The Android shell wraps the same web bundle plus Capacitor plugins.

---

## Vercel — Web

### Auto-deploy

Vercel watches the `main` branch and deploys on every push. Preview deployments are created for any other branch.

Build command (auto-detected from pnpm lockfile):

```bash
pnpm install --frozen-lockfile
pnpm build
```

If you ever see `Lockfile not found` in build logs, `pnpm-lock.yaml` is gitignored or missing — fix it (see "Lockfile" below).

### Required environment variables

All set in **Vercel → Project → Settings → Environment Variables**. Production environment.

| Variable                       | Purpose                                           |
| ------------------------------ | ------------------------------------------------- |
| `AUTH_SECRET_KEY`              | JWT signing secret (HS256). 32+ random bytes.     |
| `KV_REST_API_URL`              | Upstash Redis REST URL                            |
| `KV_REST_API_TOKEN`            | Upstash Redis REST token                          |
| `VAPID_EMAIL`                  | `mailto:` URL for VAPID                           |
| `VAPID_PUBLIC_KEY`             | VAPID public key (also referenced client-side)    |
| `VAPID_PRIVATE_KEY`            | VAPID private key                                 |
| `FIREBASE_PROJECT_ID`          | Firebase project ID for FCM                       |
| `FIREBASE_CLIENT_EMAIL`        | Service account email                             |
| `FIREBASE_PRIVATE_KEY`         | Service account private key with **literal `\n`** |
| `SENTRY_AUTH_TOKEN`            | For source-map upload at build time               |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same as `VAPID_PUBLIC_KEY` but client-exposed     |

### `FIREBASE_PRIVATE_KEY` quirk

Multi-line PEM keys do not survive being pasted into env vars across most CI systems. The convention is to escape newlines as literal `\n`:

```
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n
```

Server code converts at runtime:

```ts
privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
```

**Don't change this.** If `firebase-admin` errors with `Failed to parse private key`, the `\n` literals were resolved too early — re-paste the env var with literal backslash-n sequences.

### Sentry

- Org: `t7sen-c0`
- Project: `our-space`
- Tunnel route: `/monitoring` (set via `next.config.ts`)
- Source maps: uploaded automatically when `SENTRY_AUTH_TOKEN` is present
- Tree-shaking: `removeDebugLogging: true` strips `Sentry.logger.*` calls in production

The tunnel route exists to bypass ad-blockers. Confirm it does not collide with any middleware matchers if you add middleware.

### Custom domain

`t7senlovesbesho.me` → Vercel project. DNS via the registrar's CNAME to `cname.vercel-dns.com`. No www subdomain.

The domain is independent of project name and Git repo name. Renames don't affect it.

### Deployment verification

After every push to `main`:

1. Open the Vercel deployments tab.
2. Confirm the build succeeded (green check).
3. Hit `https://t7senlovesbesho.me/api/health` (if it exists) or load `/` and check the network tab for 200s.
4. Test biometric unlock on T7SEN's device.
5. Test Web Push fallback on Besho's device.
6. Send a note from one account, confirm SSE delivery + push routing on the other.

If any of these fail, **redeploy without build cache** before investigating further. Stale cache is the cause of more "mystery" Vercel issues than actual code regressions.

---

## Lockfile

`pnpm-lock.yaml` **must be committed**. If it's in `.gitignore`, remove it immediately:

```bash
# Remove the gitignore entry first
sed -i '/pnpm-lock.yaml/d' .gitignore

# Force-add since it was previously ignored
git add -f pnpm-lock.yaml
git add .gitignore
git commit -m "chore: commit pnpm-lock.yaml"
git push origin main
```

`package.json` should pin the package manager:

```json
{
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

CI uses `pnpm install --frozen-lockfile`. Local installs after a `pnpm add` regenerate the lockfile — commit it in the same commit as the `package.json` change.

---

## Android — Capacitor

### Prerequisites

- Android Studio with the Android 14 SDK or newer
- JDK 17+
- The keystore at `C:\Users\T7SEN\keys\ourspace.jks`

### Build

```bash
cd /path/to/our-space
pnpm install --frozen-lockfile
pnpm build                    # Next.js → /out
npx cap sync android          # Copy /out → android/app/src/main/assets/public
```

Then in Android Studio:

1. Open the `android/` folder as a project.
2. **Build → Generate Signed Bundle / APK** → APK → Release.
3. Select the keystore. Enter the passwords (which are not in the repo — they live in your password manager).
4. Build → APK lands in `android/app/build/outputs/apk/release/`.

### `versionCode` discipline

Bump `android/app/build.gradle` for every release:

```gradle
versionCode 14
versionName "1.4.0"
```

`versionCode` is a monotonically increasing integer. Skipping numbers is fine. Repeating a number is not — Android refuses to install an APK with `versionCode <= installed`.

`versionName` should track `package.json`'s `version` field for traceability.

### Sideload to devices

T7SEN's Samsung: enable **Install from unknown sources** for whatever file manager you use. Tap the APK to install.

Besho's Honor: same procedure. Plus — verify Web Push is registered after install by sending a test notification from T7SEN's account. Without GMS, FCM will fail; the absence of a FCM token in `redis.get('push:fcm:Besho')` is the expected state.

### `appId` is sacred

`me.t7senlovesbesho`. **Never change it.** Changing the application ID:

- Treats every device as a fresh install
- Resets biometric enrollment (Preferences keys are namespaced by appId)
- Invalidates FCM tokens
- Strands the old icon on the home screen until manually removed

Display name (`appName: 'Our Space'` in `capacitor.config.ts`) is what the user reads — change it freely. The change propagates through `cap sync` to `android/app/src/main/res/values/strings.xml`. Don't edit `strings.xml` directly; it gets regenerated.

---

## Renames

- **GitHub repo rename:** safe, auto-redirects.
- **Vercel project rename:** changes the `*.vercel.app` subdomain only; custom domain unaffected.
- **`package.json` `name`:** safe, change to match the new repo.
- **`appName` in `capacitor.config.ts`:** safe, regenerates `strings.xml` on `cap sync`.
- **`appId` in `capacitor.config.ts`:** **destructive**, see above.

---

## Service Worker

Serwist outputs `public/sw.js` and friends at build time. These files are gitignored — never commit them. Vercel and local builds both regenerate them.

When deploying changes that affect the service worker (push handler, caching rules), users may see the **old** SW until they:

- Close all tabs of the site
- Or trigger an explicit update via the app's update flow

For aggressive cases, bump the cache version in the Serwist config so the old SW is force-replaced.

---

## Smoke Test Checklist

Run this after every non-trivial deploy:

- [ ] `https://t7senlovesbesho.me` loads on desktop
- [ ] Login works for both accounts
- [ ] FloatingNavbar badge counts populate
- [ ] `/notes` SSE delivers a new note within 10s
- [ ] Push notification fires on the partner device when not on `/notes`
- [ ] Push notification is **suppressed** when partner is on `/notes`
- [ ] Biometric unlock on T7SEN's Samsung after backgrounding
- [ ] Web Push delivery on Besho's Honor (manual: send a hug)
- [ ] APK install replaces existing app without resetting biometric enrollment
- [ ] Sentry receives at least one event from the new release (check the Sentry dashboard)

---

## Cross-References

- `next.config.ts` — Sentry wiring, tunnel route
- `src/instrumentation.ts` — Sentry runtime registration
- `capacitor.config.ts` — appId, appName, webDir
- `android/app/build.gradle` — versionCode, versionName, applicationId
- `package.json` — packageManager, engines, version
- [`./push-routing.md`](./push-routing.md) — push delivery details
- [`./capacitor-native.md`](./capacitor-native.md) — Capacitor plugin handling
