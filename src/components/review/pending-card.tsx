// src/components/review/pending-card.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, Lock, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptic";
import { TITLE_BY_AUTHOR } from "@/lib/constants";
import type { ReviewAuthor, ReviewRecord } from "@/lib/review-constants";
import { formatWeekLabel } from "@/lib/review-utils";

interface PendingCardProps {
  currentAuthor: ReviewAuthor;
  myRecord: ReviewRecord;
  withinWindow: boolean;
  windowClosesAt: number;
  windowOpensAt: number | null;
  partnerSubmitted: boolean;
  onEdit: () => void;
  /**
   * Refetch bundle. Called on a 15s timer while in the waiting state
   * AND on tab visibility change. The reveal happens server-side when
   * partner submits; this card just polls until the bundle reflects it.
   */
  onPoll: () => void;
}

const POLL_INTERVAL_MS = 15_000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

/**
 * Post-submit, pre-reveal state. Two flavors driven by `withinWindow`:
 *
 *   Window open: partner hasn't submitted yet. Polls. Allows edits.
 *   Window closed: orphaned. The reflection stays private to the
 *     author. No reveal will ever fire.
 *
 * The card never shows partner content — only a yes/no boolean for
 * partner submission, which is informational only (it'll usually
 * transition straight to RevealCard on the next poll, since reveal
 * fires server-side the moment partner submits).
 */
export function PendingCard({
  currentAuthor,
  myRecord,
  withinWindow,
  windowClosesAt,
  windowOpensAt,
  partnerSubmitted,
  onEdit,
  onPoll,
}: PendingCardProps) {
  const partner: ReviewAuthor = currentAuthor === "T7SEN" ? "Besho" : "T7SEN";
  const [now, setNow] = useState(() => Date.now());

  // Polling — only while the window is open (orphaned weeks can't
  // transition).
  useEffect(() => {
    if (!withinWindow) return;

    const tick = () => {
      setNow(Date.now());
      onPoll();
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);

    const doc = (globalThis as unknown as { document?: Document }).document;
    const onVisibility = () => {
      if (doc?.visibilityState === "visible") tick();
    };
    doc?.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  }, [withinWindow, onPoll]);

  const partnerTitle = TITLE_BY_AUTHOR[partner];
  const remaining = withinWindow ? windowClosesAt - now : 0;
  const reopensAt = windowOpensAt;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-3xl border border-white/5 bg-card/40 p-6 sm:p-8",
        "backdrop-blur-md shadow-xl shadow-black/20",
      )}
    >
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {withinWindow ? "Reflection submitted" : "Reflection sealed"}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground/50">
            Week of {formatWeekLabel(myRecord.weekDate)}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1",
            "border text-[10px] font-bold uppercase tracking-wider",
            withinWindow
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-muted-foreground/15 bg-black/20 text-muted-foreground/60",
          )}
        >
          {withinWindow ? (
            <Clock className="h-3 w-3" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
          {withinWindow ? "Waiting" : "Closed"}
        </div>
      </header>

      <div className="space-y-4 rounded-2xl border border-white/5 bg-black/20 p-5">
        {withinWindow ? (
          <>
            <p className="text-sm leading-relaxed text-foreground/80">
              {partnerSubmitted
                ? `${partnerTitle} just submitted. Revealing both reflections momentarily…`
                : `Waiting on ${partnerTitle}. Both reflections reveal once ${partnerTitle} submits.`}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-wider text-muted-foreground/50">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                Closes in {formatRemaining(remaining)}
              </span>
              {partnerSubmitted && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Revealing
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-foreground/80">
              {partnerSubmitted
                ? `Both reflections didn't reveal in time. This stays private.`
                : `${partnerTitle} didn't submit. Your reflection stays private — it won't be shown to anyone.`}
            </p>
            {reopensAt !== null && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
                Next window opens in {formatRemaining(reopensAt - now)}
              </p>
            )}
          </>
        )}
      </div>

      {withinWindow && (
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              void vibrate(20, "light");
              onEdit();
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1.5",
              "text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
              "transition-all hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit reflection
          </button>
        </div>
      )}
    </motion.section>
  );
}
