"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { getSafeWordHistory, type SafeWordEvent } from "@/app/actions/safeword";
import { cn } from "@/lib/utils";

const MY_TZ = "Africa/Cairo";

function formatEventTime(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

/**
 * Safe-word activation log. Visible only to T7SEN —
 * the server action enforces this; the component simply
 * renders nothing if the fetch returns an empty array due
 * to the role check.
 */
export function SafeWordHistory() {
  const [events, setEvents] = useState<SafeWordEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    getSafeWordHistory().then((data) => {
      setTimeout(() => {
        setEvents(data);
        setIsLoading(false);
      }, 0);
    });
  }, []);

  // Server enforces T7SEN-only; if empty after load, render nothing
  if (!isLoading && events.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border p-5 transition-colors",
        "border-destructive/10 bg-destructive/5",
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-destructive/10 p-2">
            <ShieldAlert className="h-3.5 w-3.5 text-destructive/70" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-destructive/70">
              Safe Word Log
            </p>
            {!isLoading && (
              <p className="text-[10px] text-muted-foreground/40">
                {events.length} activation
                {events.length !== 1 ? "s" : ""} recorded
              </p>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-2">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-9 animate-pulse rounded-xl bg-muted/20"
                    />
                  ))
                : events.map((event, i) => (
                    <motion.div
                      key={event.timestamp}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        "flex items-center justify-between rounded-xl",
                        "border border-destructive/10 bg-black/20 px-3.5 py-2.5",
                      )}
                    >
                      <span className="text-[10px] font-semibold text-destructive/60">
                        🔴 {event.triggeredBy}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground/40">
                        {formatEventTime(event.timestamp)}
                      </span>
                    </motion.div>
                  ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
