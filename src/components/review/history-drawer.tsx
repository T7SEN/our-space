// src/components/review/history-drawer.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptic";
import { MY_TZ } from "@/lib/constants";
import { deleteReviewWeek, getRevealedHistory } from "@/app/actions/reviews";
import { getCurrentAuthor } from "@/app/actions/auth";
import type { RevealedHistoryItem } from "@/lib/review-constants";

function formatRevealedShort(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
  }).format(new Date(ts));
}

/**
 * Past revealed weeks. Collapsed by default; fetches lazily on first
 * expand and caches results in state. Clicking an item updates the
 * `?week=` search param — the page orchestrator picks it up and
 * fetches that week's bundle.
 *
 * Solo / orphaned weeks (one-side submissions that never revealed)
 * are intentionally NOT listed here. They remain accessible only via
 * the page's current-week flow, by their author.
 */
export function HistoryDrawer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeWeek = searchParams.get("week");

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<RevealedHistoryItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSir, setIsSir] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentAuthor().then((a) => setIsSir(a === "T7SEN"));
  }, []);

  useEffect(() => {
    if (!confirmingId) return;
    const t = setTimeout(() => setConfirmingId(null), 5000);
    return () => clearTimeout(t);
  }, [confirmingId]);

  const handleDeleteWeek = async (weekDate: string) => {
    void vibrate(50, "heavy");
    setDeletingId(weekDate);
    const r = await deleteReviewWeek(weekDate);
    setDeletingId(null);
    if (!r.error) {
      setItems((prev) => (prev ?? []).filter((it) => it.weekDate !== weekDate));
      setConfirmingId(null);
      // If the deleted week was the active one, route back to current.
      if (weekDate === activeWeek) router.push("/review");
    }
  };

  useEffect(() => {
    if (!isOpen || items !== null) return;
    let mounted = true;
    setTimeout(() => {
      if (!mounted) return;
      setIsLoading(true);
    }, 0);

    getRevealedHistory()
      .then((data) => {
        if (!mounted) return;
        setTimeout(() => {
          setItems(data);
          setIsLoading(false);
        }, 0);
      })
      .catch(() => {
        if (!mounted) return;
        setTimeout(() => {
          setItems([]);
          setIsLoading(false);
        }, 0);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, items]);

  const onSelect = (weekDate: string) => {
    void vibrate(20, "light");
    if (weekDate === activeWeek) return;
    router.push(`/review?week=${encodeURIComponent(weekDate)}`);
  };

  const onClearWeek = () => {
    void vibrate(20, "light");
    router.push("/review");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={cn(
        "rounded-3xl border border-white/5 bg-card/40 p-5",
        "backdrop-blur-md shadow-xl shadow-black/20",
      )}
    >
      <button
        type="button"
        onClick={() => {
          void vibrate(20, "light");
          setIsOpen((v) => !v);
        }}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-muted-foreground/10 p-2 text-muted-foreground/70">
            <History className="h-3.5 w-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Past reflections
            </p>
            <p className="text-[10px] text-muted-foreground/40">
              Revealed weeks only
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-2">
              {activeWeek && (
                <button
                  type="button"
                  onClick={onClearWeek}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl",
                    "border border-primary/20 bg-primary/5 px-3.5 py-2.5",
                    "text-left transition-colors hover:bg-primary/10",
                  )}
                >
                  <span className="text-[11px] font-semibold text-primary">
                    ← Back to current week
                  </span>
                </button>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
                </div>
              )}

              {!isLoading && items !== null && items.length === 0 && (
                <p className="py-4 text-center text-[11px] text-muted-foreground/40">
                  No past reflections yet.
                </p>
              )}

              {!isLoading &&
                items !== null &&
                items.length > 0 &&
                items.map((item) => {
                  const isActive = item.weekDate === activeWeek;
                  const isConfirming = confirmingId === item.weekDate;
                  const isDeleting = deletingId === item.weekDate;
                  return (
                    <div
                      key={item.weekDate}
                      className={cn(
                        "flex items-stretch gap-1 rounded-xl",
                        "border transition-colors",
                        isActive
                          ? "border-primary/20 bg-primary/10"
                          : "border-white/5 bg-black/20",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(item.weekDate)}
                        disabled={isActive || undefined}
                        className={cn(
                          "flex flex-1 items-center justify-between gap-2 px-3.5 py-2.5",
                          "text-left transition-colors",
                          isActive
                            ? "cursor-default"
                            : "hover:bg-white/5",
                          "rounded-xl",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[11px] font-semibold",
                            isActive ? "text-primary" : "text-foreground/80",
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                          Revealed {formatRevealedShort(item.revealedAt)}
                        </span>
                      </button>
                      {isSir && !isConfirming && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void vibrate(30, "light");
                            setConfirmingId(item.weekDate);
                          }}
                          aria-label={`Delete week ${item.label}`}
                          className="flex shrink-0 items-center justify-center rounded-r-xl px-2.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      {isSir && isConfirming && (
                        <div className="flex shrink-0 items-center gap-1 px-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingId(null);
                            }}
                            disabled={isDeleting || undefined}
                            className="rounded-full border border-border/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground active:scale-95 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteWeek(item.weekDate);
                            }}
                            disabled={isDeleting || undefined}
                            className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white hover:bg-destructive/90 active:scale-95 disabled:opacity-60"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-2.5 w-2.5" />
                            )}
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
