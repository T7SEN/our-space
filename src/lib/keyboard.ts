import { isNative } from "@/lib/native";
import { logger } from "./logger";

/**
 * Dismisses the on-screen keyboard on native platforms. Silent no-op on
 * web (the browser handles its own focus/blur lifecycle there).
 *
 * Call after a form submit succeeds so the user doesn't have to manually
 * tap-out — feels native, frees the screen for confirmation UI.
 *
 * Fire-and-forget: prefix calls with `void`.
 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch (err) {
    logger.error("[keyboard] hide failed:", err);
  }
}
