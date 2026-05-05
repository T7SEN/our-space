"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  getHealthSnapshot,
  repairIndexes,
  type HealthSnapshot,
  type RepairResult,
} from "@/app/actions/admin";
import { TITLE_BY_AUTHOR } from "@/lib/constants";
import { vibrate } from "@/lib/haptic";
import { cn } from "@/lib/utils";

const CONFIRM_TIMEOUT_MS = 5_000;

export default function HealthPage() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [confirmingRepair, setConfirmingRepair] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<
    RepairResult["repaired"] | null
  >(null);

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getHealthSnapshot();
      if (result.error) {
        setError(result.error);
      } else if (result.health) {
        setHealth(result.health);
        setError(null);
      }
    } catch {
      setError("Failed to read health.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!confirmingRepair) return;
    const id = setTimeout(
      () => setConfirmingRepair(false),
      CONFIRM_TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [confirmingRepair]);

  const handleRepair = async () => {
    void vibrate([100, 50, 100], "heavy");
    setRepairing(true);
    setError(null);
    try {
      const result = await repairIndexes();
      if (result.error) {
        setError(result.error);
      } else {
        setRepairResult(result.repaired ?? null);
        setConfirmingRepair(false);
        await fetchHealth();
      }
    } finally {
      setRepairing(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28 md:p-12 md:pb-32">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Admin
        </Link>
        <button
          type="button"
          onClick={() => {
            void vibrate(20, "light");
            void fetchHealth();
          }}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </header>

      <h1 className="text-2xl font-bold tracking-tight">Health &amp; repair</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Diagnostics + index reseed. Run repair after a manual purge that
        bypassed the soft-delete helpers, or if pin counts feel wrong.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {!health ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border/40 bg-card"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Redis">
            <Diag
              label="Connection"
              ok={health.redis.ok}
              detail={
                health.redis.latencyMs != null
                  ? `${health.redis.latencyMs}ms`
                  : "—"
              }
            />
          </Section>

          <Section title="Push (FCM)">
            <Diag
              label="Credentials"
              ok={health.fcm.credentialsPresent}
              detail={
                health.fcm.credentialsPresent
                  ? "env vars set"
                  : "missing FIREBASE_*"
              }
            />
            <Diag
              label={`${TITLE_BY_AUTHOR.T7SEN} token`}
              ok={health.fcm.tokensRegistered.T7SEN}
              detail={
                health.fcm.tokensRegistered.T7SEN ? "registered" : "missing"
              }
            />
            <Diag
              label={`${TITLE_BY_AUTHOR.Besho} token`}
              ok={health.fcm.tokensRegistered.Besho}
              detail={
                health.fcm.tokensRegistered.Besho ? "registered" : "missing"
              }
            />
          </Section>

          <Section title="Recent severities (24h)">
            <Diag
              label="Errors"
              ok={health.errorsLast24h === 0}
              detail={`${health.errorsLast24h}`}
            />
            <Diag
              label="Warnings"
              ok={health.warningsLast24h === 0}
              detail={`${health.warningsLast24h}`}
            />
          </Section>

          <Section title="Notes index integrity">
            <Diag
              label="Index size"
              ok
              detail={`${health.countKeysVsIndex.indexTotal}`}
            />
            <Diag
              label={`Stored ${TITLE_BY_AUTHOR.T7SEN}`}
              ok={
                health.countKeysVsIndex.storedT7SEN ===
                health.countKeysVsIndex.expectedT7SEN
              }
              detail={`${health.countKeysVsIndex.storedT7SEN} stored / ${health.countKeysVsIndex.expectedT7SEN} expected`}
            />
            <Diag
              label={`Stored ${TITLE_BY_AUTHOR.Besho}`}
              ok={
                health.countKeysVsIndex.storedBesho ===
                health.countKeysVsIndex.expectedBesho
              }
              detail={`${health.countKeysVsIndex.storedBesho} stored / ${health.countKeysVsIndex.expectedBesho} expected`}
            />
            <Diag
              label="Pinned set size"
              ok
              detail={`${health.pinnedSetSize}`}
            />
          </Section>

          {repairResult && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3 text-xs text-emerald-400">
              Repaired:
              <ul className="mt-1 space-y-0.5">
                <li>
                  {TITLE_BY_AUTHOR.T7SEN}:{" "}
                  {repairResult.countT7SEN.before} →{" "}
                  {repairResult.countT7SEN.after}
                </li>
                <li>
                  {TITLE_BY_AUTHOR.Besho}:{" "}
                  {repairResult.countBesho.before} →{" "}
                  {repairResult.countBesho.after}
                </li>
                <li>Stale pinned removed: {repairResult.pinnedRemoved}</li>
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {confirmingRepair ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void vibrate(20, "light");
                    setConfirmingRepair(false);
                  }}
                  disabled={repairing}
                  className="rounded-full border border-border/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleRepair()}
                  disabled={repairing}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95 disabled:opacity-60"
                >
                  {repairing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wrench className="h-3 w-3" />
                  )}
                  Confirm repair
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void vibrate(50, "medium");
                  setConfirmingRepair(true);
                }}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 active:scale-95"
              >
                <Wrench className="h-3 w-3" />
                Reseed indexes
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Diag({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        )}
        <span>{label}</span>
      </span>
      <span
        className={cn(
          "font-mono text-xs",
          ok ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {detail}
      </span>
    </li>
  );
}

