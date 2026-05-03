// src/components/review/week-summary-panel.tsx
"use client";

import { motion } from "motion/react";
import {
  BookHeart,
  CheckSquare,
  Award,
  Hand,
  ScrollText,
  ShieldAlert,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TITLE_BY_AUTHOR, MY_TZ } from "@/lib/constants";
import type { ReviewAuthor, WeekSummary } from "@/lib/review-constants";

interface WeekSummaryPanelProps {
  summary: WeekSummary;
  currentAuthor: ReviewAuthor;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "good" | "muted";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border px-3 py-2.5 text-center",
        tone === "default" && "border-white/5 bg-black/20",
        tone === "warn" && "border-destructive/15 bg-destructive/5",
        tone === "good" && "border-primary/15 bg-primary/5",
        tone === "muted" && "border-white/5 bg-black/10",
      )}
    >
      <span
        className={cn(
          "text-lg font-bold tabular-nums leading-none",
          tone === "warn" && "text-destructive/80",
          tone === "good" && "text-primary",
          (tone === "default" || tone === "muted") && "text-foreground/90",
        )}
      >
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
        {label}
      </span>
    </div>
  );
}

function SectionHeader({
  Icon,
  label,
}: {
  Icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </h3>
    </div>
  );
}

/**
 * Read-only aggregate of existing data for the reviewed week.
 * Rendered alongside the writing surface so the writer has facts on
 * screen — moods, hugs, tasks completed, rules acknowledged, ledger
 * activity, permission outcomes, notes exchanged.
 *
 * Privacy invariants:
 *  - Permission counts are status-only — no `decidedByRuleId` here.
 *  - Safe-word timestamps are gated on `currentAuthor === "T7SEN"`
 *    upstream; this component renders whatever the server returned.
 */
export function WeekSummaryPanel({
  summary,
  currentAuthor,
}: WeekSummaryPanelProps) {
  const t7senTitle = TITLE_BY_AUTHOR.T7SEN;
  const beshoTitle = TITLE_BY_AUTHOR.Besho;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={cn(
        "rounded-3xl border border-white/5 bg-card/40 p-5 sm:p-7",
        "backdrop-blur-xl shadow-xl shadow-black/20",
      )}
    >
      <header className="mb-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          The week, in data
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground/40">
          Aggregated from existing records. Read-only.
        </p>
      </header>

      <div className="space-y-6">
        {/* Mood grid */}
        <div>
          <SectionHeader Icon={Heart} label="Mood & state" />
          <div className="space-y-1.5">
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((d, i) => (
                <span
                  key={`day-${i}`}
                  className="text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground/30"
                >
                  {d}
                </span>
              ))}
            </div>
            {(["T7SEN", "Besho"] as const).map((who) => (
              <div
                key={who}
                className="grid grid-cols-7 gap-1"
                aria-label={`${TITLE_BY_AUTHOR[who]} mood week`}
              >
                {summary.mood[who].map((cell) => (
                  <div
                    key={`${who}-${cell.date}`}
                    className={cn(
                      "flex h-10 flex-col items-center justify-center rounded-lg",
                      "bg-black/20 text-base leading-none",
                    )}
                    title={cell.date}
                  >
                    <span>{cell.mood ?? "·"}</span>
                    {cell.state && (
                      <span className="text-[9px] opacity-50">
                        {cell.state}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-1 text-[9px] text-muted-foreground/30">
              <span>↑ {t7senTitle}</span>
              <span>↓ {beshoTitle}</span>
            </div>
          </div>
        </div>

        {/* Hugs */}
        <div>
          <SectionHeader Icon={BookHeart} label="Hugs sent" />
          <div className="grid grid-cols-2 gap-2">
            <StatTile label={t7senTitle} value={summary.hugs.T7SEN} />
            <StatTile label={beshoTitle} value={summary.hugs.Besho} />
          </div>
        </div>

        {/* Rules */}
        <div>
          <SectionHeader Icon={ScrollText} label="Rules" />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Created" value={summary.rules.created} />
            <StatTile label="Acknowledged" value={summary.rules.acknowledged} />
            <StatTile
              label="Completed"
              value={summary.rules.completed}
              tone="good"
            />
          </div>
        </div>

        {/* Tasks */}
        <div>
          <SectionHeader Icon={CheckSquare} label="Tasks" />
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Created" value={summary.tasks.created} />
            <StatTile
              label="Completed"
              value={summary.tasks.completed}
              tone="good"
            />
          </div>
        </div>

        {/* Ledger */}
        <div>
          <SectionHeader Icon={Award} label="Ledger" />
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Rewards"
              value={summary.ledger.rewards}
              tone="good"
            />
            <StatTile
              label="Punishments"
              value={summary.ledger.punishments}
              tone="warn"
            />
          </div>
        </div>

        {/* Permissions */}
        <div>
          <SectionHeader Icon={Hand} label="Permissions" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <StatTile label="Asked" value={summary.permissions.submitted} />
            <StatTile
              label="Approved"
              value={summary.permissions.approved}
              tone="good"
            />
            <StatTile
              label="Denied"
              value={summary.permissions.denied}
              tone="warn"
            />
            <StatTile label="Queued" value={summary.permissions.queued} />
            <StatTile
              label="Withdrew"
              value={summary.permissions.withdrawn}
              tone="muted"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <SectionHeader Icon={BookHeart} label="Notes" />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Total" value={summary.notes.total} />
            <StatTile label={t7senTitle} value={summary.notes.T7SEN} />
            <StatTile label={beshoTitle} value={summary.notes.Besho} />
          </div>
        </div>

        {/* Safeword */}
        <div>
          <SectionHeader Icon={ShieldAlert} label="Safe word" />
          <div className="space-y-2">
            <StatTile
              label="Triggered"
              value={summary.safeword.triggered}
              tone={summary.safeword.triggered > 0 ? "warn" : "muted"}
            />
            {currentAuthor === "T7SEN" &&
              summary.safeword.timestamps.length > 0 && (
                <ul className="space-y-1 rounded-2xl border border-destructive/10 bg-destructive/5 p-3">
                  {summary.safeword.timestamps.map((ts) => (
                    <li
                      key={ts}
                      className="text-[10px] tabular-nums text-destructive/70"
                    >
                      {formatTimestamp(ts)}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
