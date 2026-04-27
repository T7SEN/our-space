"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { History } from "lucide-react";
import { getMoodHistory, type MoodHistoryEntry } from "@/app/actions/mood";
import { cn } from "@/lib/utils";

interface MoodHistoryGridProps {
  currentAuthor: string | null;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shortDay(dateStr: string): string {
  // dateStr is YYYY-MM-DD; avoid timezone offset by parsing manually
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
}

function isToday(dateStr: string): boolean {
  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date()) === dateStr
  );
}

/**
 * A compact 7-day mood strip rendered as emoji cells.
 * Shows both partners' moods side-by-side for each day.
 */
export function MoodHistoryGrid({ currentAuthor }: MoodHistoryGridProps) {
  const [history, setHistory] = useState<MoodHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMoodHistory(7).then((data) => {
      setTimeout(() => {
        setHistory(data);
        setIsLoading(false);
      }, 0);
    });
  }, []);

  const isPartner = currentAuthor === "Besho";

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/20 p-5">
        <div className="h-4 w-28 animate-pulse rounded bg-muted/30" />
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-14 flex-1 animate-pulse rounded-xl bg-muted/20"
            />
          ))}
        </div>
      </div>
    );
  }

  const hasAnyData = history.some(
    (e) => e.myMood !== null || e.partnerMood !== null,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-card/20 p-5"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Mood History
        </h2>
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <History className="h-3.5 w-3.5" />
        </div>
      </div>

      {!hasAnyData ? (
        <p className="py-4 text-center text-xs text-muted-foreground/40">
          No mood data for the past week yet.
        </p>
      ) : (
        <div className="flex gap-1.5">
          {history.map((entry, i) => {
            const today = isToday(entry.date);
            const myMood = entry.myMood;
            const partnerMood = entry.partnerMood;

            return (
              <motion.div
                key={entry.date}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                {/* Day label */}
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    today ? "text-primary" : "text-muted-foreground/30",
                  )}
                >
                  {shortDay(entry.date)}
                </span>

                {/* Mood cell */}
                <div
                  className={cn(
                    "flex w-full flex-col items-center gap-0.5 rounded-xl py-2",
                    today
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "bg-black/20",
                  )}
                >
                  {/* My mood — always top */}
                  <span
                    className="text-base leading-none"
                    title={myMood ? "Your mood" : "No mood logged"}
                  >
                    {myMood ?? "·"}
                  </span>

                  {/* Divider */}
                  <div className="h-px w-4 bg-white/10" />

                  {/* Partner mood — always bottom */}
                  <span
                    className="text-base leading-none opacity-60"
                    title={partnerMood ? "Partner's mood" : "No mood logged"}
                  >
                    {partnerMood ?? "·"}
                  </span>
                </div>

                {/* Today marker */}
                {today && <div className="h-1 w-1 rounded-full bg-primary" />}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-3">
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/30">
          <div className="h-2 w-2 rounded-full bg-foreground/30" />
          {isPartner ? "You" : "Besho (top)"}
        </span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/30">
          <div className="h-2 w-2 rounded-full bg-foreground/20" />
          {isPartner ? "Sir (bottom)" : "Besho (bottom)"}
        </span>
      </div>
    </motion.div>
  );
}
