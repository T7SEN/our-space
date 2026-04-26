"use client";

import { useEffect, useRef } from "react";

const LOCK_AFTER_MS = 30_000; // 30 seconds in background

/**
 * Locks the app with biometric authentication after 30s in background.
 * Only runs on native Capacitor platform.
 * Falls back to device PIN/pattern if biometrics are unavailable.
 */
export function useBiometricLock(enabled: boolean) {
  const backgroundedAtRef = useRef<number | null>(null);
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const cap = (
      globalThis as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    let removeListener: (() => void) | null = null;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const { BiometricAuth, BiometryType } =
          await import("@aparajita/capacitor-biometric-auth");

        const listener = await App.addListener(
          "appStateChange",
          async ({ isActive }) => {
            if (!isActive) {
              // App went to background — record timestamp
              backgroundedAtRef.current = Date.now();
              return;
            }

            // App came to foreground
            if (backgroundedAtRef.current === null) return;
            if (isAuthenticatingRef.current) return;

            const elapsed = Date.now() - backgroundedAtRef.current;
            backgroundedAtRef.current = null;

            if (elapsed < LOCK_AFTER_MS) return;

            // Need to re-authenticate
            isAuthenticatingRef.current = true;

            try {
              const { isAvailable, biometryType } =
                await BiometricAuth.checkBiometry();

              if (!isAvailable) {
                // No biometrics available — don't lock
                console.info("[biometric] Not available, skipping lock.");
                isAuthenticatingRef.current = false;
                return;
              }

              const reason =
                biometryType === BiometryType.none
                  ? "Authenticate to continue"
                  : biometryType === BiometryType.touchId
                    ? "Use Touch ID to continue"
                    : biometryType === BiometryType.faceId
                      ? "Use Face ID to continue"
                      : "Use biometrics to continue";

              await BiometricAuth.authenticate({
                reason,
                cancelTitle: "",
                allowDeviceCredential: true,
                iosFallbackTitle: "Use Passcode",
                androidTitle: "Our Space",
                androidSubtitle: "Authenticate to continue",
                androidConfirmationRequired: false,
              });

              console.info("[biometric] Authentication successful.");
            } catch (err) {
              console.error("[biometric] Authentication failed:", err);
              // On failure, close the app
              try {
                const { App: AppPlugin } = await import("@capacitor/app");
                await AppPlugin.exitApp();
              } catch {
                // Best effort
              }
            } finally {
              isAuthenticatingRef.current = false;
            }
          },
        );

        removeListener = () => void listener.remove();
      } catch (err) {
        console.error("[biometric] Failed to initialize:", err);
      }
    })();

    return () => {
      removeListener?.();
    };
  }, [enabled]);
}
