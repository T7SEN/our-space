"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptic";

interface PurgeResult {
  success?: boolean;
  error?: string;
  deletedCount?: number;
}

interface PurgeButtonProps {
  /** Loud, all-caps friendly. e.g. "Purge all notes". */
  label: string;
  /** Server action that wipes the feature's data. Must be Sir-only on the server. */
  onPurge: () => Promise<PurgeResult>;
  /** Fired on success after the local state can be re-fetched. */
  onSuccess?: (deletedCount: number) => void;
  className?: string;
}

const CONFIRM_TIMEOUT_MS = 5000;

/**
 * Sir-only destructive admin control. The caller is responsible for
 * gating render on `isT7SEN` — this component does not check the role.
 *
 * Two-step confirmation pattern:
 *   1. Tap once → flips to a red Confirm button + Cancel for 5s.
 *   2. Tap Confirm within 5s → fires the purge action.
 *   3. No second tap within 5s → auto-cancel back to initial state.
 */
export function PurgeButton({
  label,
  onPurge,
  onSuccess,
  className,
}: PurgeButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [confirming]);

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
      const result = await onPurge();
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess?.(result.deletedCount ?? 0);
        setConfirming(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    void vibrate(20, "light");
    setConfirming(false);
  };

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {!confirming ? (
          <motion.button
            key="initial"
            type="button"
            onClick={handleFirstTap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5",
              "text-[10px] font-bold uppercase tracking-wider text-destructive",
              "transition-colors hover:bg-destructive/20 active:scale-95",
            )}
          >
            <Trash2 className="h-3 w-3" />
            {label}
          </motion.button>
        ) : (
          <motion.div
            key="confirming"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy || undefined}
              className="rounded-full border border-border/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5",
                "text-[10px] font-bold uppercase tracking-wider text-white",
                "transition-colors hover:bg-destructive/90 active:scale-95",
                "disabled:opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Confirm purge
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p className="text-[10px] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}
