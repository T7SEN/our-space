// src/app/review/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Loader2, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { getReviewBundle } from "@/app/actions/reviews";
import { getCurrentAuthor } from "@/app/actions/auth";
import { usePresence } from "@/hooks/use-presence";
import { useRefreshListener } from "@/hooks/use-refresh-listener";
import { currentReviewWeekDate, formatWeekLabel } from "@/lib/review-utils";
import { ReviewForm } from "@/components/review/review-form";
import { PendingCard } from "@/components/review/pending-card";
import { RevealCard } from "@/components/review/reveal-card";
import { WeekSummaryPanel } from "@/components/review/week-summary-panel";
import { HistoryDrawer } from "@/components/review/history-drawer";
import type { ReviewAuthor, ReviewBundle } from "@/lib/review-constants";

function isAuthor(value: string | null): value is ReviewAuthor {
  return value === "T7SEN" || value === "Besho";
}

/**
 * Default export — Suspense wrapper. `useSearchParams()` inside
 * `ReviewPageInner` forces a Suspense boundary at the page level
 * under Next 16's prerender rules; without one, the prerender bails
 * out of the whole route. The fallback is intentionally minimal —
 * the inner component shows its own skeleton on the next tick.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const targetWeek = searchParams.get("week") ?? undefined;

  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [currentAuthor, setCurrentAuthor] = useState<ReviewAuthor | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [now] = useState(() => Date.now());

  usePresence("/review", !!currentAuthor);

  const handleRefresh = useCallback(async () => {
    const data = await getReviewBundle(targetWeek);
    setTimeout(() => setBundle(data), 0);
  }, [targetWeek]);

  useRefreshListener(handleRefresh);

  // Initial fetch + refetch on week-param change.
  useEffect(() => {
    let mounted = true;
    // Deferred per react-hooks/set-state-in-effect — matches the
    // codebase pattern for sync setState inside mount-time effects.
    setTimeout(() => {
      if (!mounted) return;
      setBundle(null);
      setEditMode(false);
    }, 0);

    Promise.all([getReviewBundle(targetWeek), getCurrentAuthor()]).then(
      ([b, a]) => {
        if (!mounted) return;
        setBundle(b);
        setCurrentAuthor(isAuthor(a) ? a : null);
      },
    );

    return () => {
      mounted = false;
    };
  }, [targetWeek]);

  const isViewingPast =
    targetWeek !== undefined && targetWeek !== currentReviewWeekDate(now);

  return (
    <div className="relative min-h-screen bg-background p-6 pb-32 md:p-12 md:pb-32">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-125 w-125 rounded-full bg-primary/5 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-125 w-125 rounded-full bg-primary/3 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl space-y-6 pt-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back
          </Link>

          <div className="flex flex-col items-center gap-0.5">
            <h1 className="text-xl font-bold tracking-widest uppercase text-primary/80">
              Review
            </h1>
            {bundle && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                {formatWeekLabel(bundle.weekDate)}
              </span>
            )}
          </div>

          <div className="w-9" aria-hidden="true" />
        </header>

        {/* Past-week banner */}
        {isViewingPast && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl",
              "border border-primary/20 bg-primary/5 px-4 py-2.5",
            )}
          >
            <span className="text-[11px] font-semibold text-primary/90">
              Viewing a past week
            </span>
            <Link
              href="/review"
              className="text-[10px] font-bold uppercase tracking-wider text-primary/80 hover:text-primary"
            >
              Back to current
            </Link>
          </motion.div>
        )}

        {/* Body */}
        {!bundle || !currentAuthor ? (
          <ReviewSkeleton />
        ) : (
          <>
            <StateCard
              bundle={bundle}
              currentAuthor={currentAuthor}
              editMode={editMode}
              onEnterEdit={() => setEditMode(true)}
              onExitEdit={() => {
                setEditMode(false);
                void handleRefresh();
              }}
              onPoll={handleRefresh}
            />

            <WeekSummaryPanel
              summary={bundle.summary}
              currentAuthor={currentAuthor}
            />

            <HistoryDrawer />
          </>
        )}
      </div>
    </div>
  );
}

// ─── State router ─────────────────────────────────────────────────────

interface StateCardProps {
  bundle: ReviewBundle;
  currentAuthor: ReviewAuthor;
  editMode: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onPoll: () => void;
}

function StateCard({
  bundle,
  currentAuthor,
  editMode,
  onEnterEdit,
  onExitEdit,
  onPoll,
}: StateCardProps) {
  // Revealed → side-by-side, regardless of past-vs-current.
  if (bundle.revealed) {
    return (
      <RevealCard revealed={bundle.revealed} currentAuthor={currentAuthor} />
    );
  }

  // Edit mode — only valid when own record exists AND window is open.
  if (editMode && bundle.myRecord && bundle.withinWindow) {
    return (
      <ReviewForm
        weekDate={bundle.weekDate}
        existing={bundle.myRecord}
        withinWindow={bundle.withinWindow}
        onDone={onExitEdit}
      />
    );
  }

  // Own record exists, not yet revealed — pending or orphaned.
  if (bundle.myRecord) {
    return (
      <PendingCard
        currentAuthor={currentAuthor}
        myRecord={bundle.myRecord}
        withinWindow={bundle.withinWindow}
        windowClosesAt={bundle.windowClosesAt}
        windowOpensAt={bundle.windowOpensAt}
        partnerSubmitted={bundle.partnerSubmitted}
        onEdit={onEnterEdit}
        onPoll={onPoll}
      />
    );
  }

  // No own record, window open → first-submit form.
  if (bundle.withinWindow) {
    return (
      <ReviewForm
        weekDate={bundle.weekDate}
        existing={null}
        withinWindow={bundle.withinWindow}
        onDone={onExitEdit}
      />
    );
  }

  // No own record, window closed.
  return <ClosedCard bundle={bundle} />;
}

// ─── Closed-window placeholder ────────────────────────────────────────

function ClosedCard({ bundle }: { bundle: ReviewBundle }) {
  const isPastClosed =
    bundle.windowOpensAt === null ||
    bundle.windowClosesAt < (bundle.windowOpensAt ?? 0);
  const message = isPastClosed
    ? "The submission window for this week has closed and no reflection was recorded."
    : "The submission window for this week hasn't opened yet.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-3xl border border-white/5 bg-card/40 p-6 sm:p-8",
        "backdrop-blur-xl shadow-xl shadow-black/20",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-muted-foreground/10 p-2.5 text-muted-foreground/70">
          <MessageSquareQuote className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            No reflection
          </h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            {message}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
            Window: Saturday 00:00 → Sunday 23:59 Cairo
          </p>
        </div>
      </div>
    </motion.section>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="space-y-6">
      <div
        className={cn(
          "flex items-center justify-center rounded-3xl border border-white/5",
          "bg-card/40 p-12 backdrop-blur-xl shadow-xl shadow-black/20",
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    </div>
  );
}
