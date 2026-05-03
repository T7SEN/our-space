// src/components/review/reveal-card.tsx
"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TITLE_BY_AUTHOR, MY_TZ } from "@/lib/constants";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import {
  REVIEW_FIELDS,
  type RevealedPair,
  type ReviewAuthor,
  type ReviewRecord,
} from "@/lib/review-constants";
import { formatWeekLabel } from "@/lib/review-utils";

interface RevealCardProps {
  revealed: RevealedPair;
  currentAuthor: ReviewAuthor;
}

function formatRevealedAt(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function AuthorColumn({
  record,
  isMine,
  authorTitle,
}: {
  record: ReviewRecord;
  isMine: boolean;
  authorTitle: string;
}) {
  return (
    <article
      className={cn(
        "rounded-3xl border p-5 sm:p-6",
        isMine
          ? "border-primary/20 bg-primary/5"
          : "border-white/5 bg-black/20",
      )}
    >
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/80">
          {authorTitle}
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
          {isMine ? "You" : "Them"}
        </span>
      </header>

      <div className="space-y-5">
        {REVIEW_FIELDS.map((meta) => {
          const value = record[meta.key];
          const empty = !value || value.trim().length === 0;
          return (
            <section key={meta.key}>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
                {meta.label}
              </h4>
              {empty ? (
                <p className="text-xs italic text-muted-foreground/30">
                  (left blank)
                </p>
              ) : (
                <MarkdownRenderer
                  content={value}
                  className={cn(
                    "text-sm leading-relaxed",
                    "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
                  )}
                />
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}

/**
 * Side-by-side reveal of both authors' reflections. Stacks vertically
 * on mobile, grids on md+. The mine/theirs distinction is rendered
 * via subtle color rather than position so neither author's column
 * is visually privileged.
 */
export function RevealCard({ revealed, currentAuthor }: RevealCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          "rounded-3xl border border-white/5 bg-card/40 px-5 py-4",
          "backdrop-blur-xl shadow-xl shadow-black/20",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Reflections revealed
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/50">
              Week of {formatWeekLabel(revealed.weekDate)}
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
          {formatRevealedAt(revealed.revealedAt)} Cairo
        </span>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <AuthorColumn
          record={revealed.T7SEN}
          isMine={currentAuthor === "T7SEN"}
          authorTitle={TITLE_BY_AUTHOR.T7SEN}
        />
        <AuthorColumn
          record={revealed.Besho}
          isMine={currentAuthor === "Besho"}
          authorTitle={TITLE_BY_AUTHOR.Besho}
        />
      </div>
    </motion.section>
  );
}
