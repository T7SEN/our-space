"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptic";
import { summonKitten } from "@/app/actions/admin";

const CONFIRM_TIMEOUT_MS = 5_000;
const FLASH_MS = 3_000;

/**
 * Sir-only summon button. Mirrors the destructive `<PurgeButton>` shape
 * (two-step confirm + 5s auto-cancel + heavy-haptic commit) but with a
 * primary-tinted palette since this is an action of authority, not a
 * destructive operation. Caller is responsible for gating render —
 * the parent route is already Sir-only via `src/app/admin/layout.tsx`.
 */
export function SummonButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [confirming]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

  const handleFirstTap = () => {
    void vibrate(50, "medium");
    setError(null);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    void vibrate([100, 50, 100], "heavy");
    setBusy(true);
    setError(null);
    try {
      const result = await summonKitten();
      if (result.error) {
        setError(result.error);
      } else {
        setFlash("She's been summoned.");
        setConfirming(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summon failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    void vibrate(20, "light");
    setConfirming(false);
  };

  return (
    <div className="mb-6">
      <AnimatePresence mode="wait" initial={false}>
        {!confirming ? (
          <motion.button
            key="initial"
            type="button"
            onClick={handleFirstTap}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex w-full items-center justify-center gap-2",
              "rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5",
              "text-sm font-bold uppercase tracking-wider text-primary",
              "transition-colors hover:bg-primary/20 active:scale-[0.99]",
            )}
          >
            <BellRing className="h-4 w-4" />
            Summon kitten
          </motion.button>
        ) : (
          <motion.div
            key="confirming"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy || undefined}
              className="rounded-2xl border border-border/40 px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground active:scale-[0.99] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-2",
                "rounded-2xl bg-primary px-4 py-3.5",
                "text-sm font-bold uppercase tracking-wider text-primary-foreground",
                "transition-colors hover:bg-primary/90 active:scale-[0.99]",
                "disabled:opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              Confirm summon
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      {flash && (
        <p className="mt-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-2.5 text-xs text-emerald-400">
          {flash}
        </p>
      )}
    </div>
  );
}
