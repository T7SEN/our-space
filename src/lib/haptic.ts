/**
 * Triggers a short haptic pulse on devices that support it (Android).
 * Silently ignored on iOS, desktop, and when the Vibration API is unavailable.
 */
export function vibrate(pattern: number | number[] = 8) {
  const win = globalThis as unknown as {
    navigator?: {
      vibrate?: (pattern: number | number[]) => boolean;
    };
  };

  if (win.navigator?.vibrate) {
    win.navigator.vibrate(pattern);
  }
}
