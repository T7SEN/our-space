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
    // Vibration API unit is milliseconds. The human sensory threshold for a
    // felt vibration is ~50ms — scalar values below that are imperceptible.
    // Array patterns (rhythms) are left untouched.
    const corrected =
      typeof pattern === "number" ? Math.max(pattern, 100) : pattern;
    win.navigator.vibrate(corrected);
  }
}
