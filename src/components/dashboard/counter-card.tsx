"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { START_DATE, COUNTER_LABEL } from "@/lib/constants";
import { vibrate } from "@/lib/haptic";

type TimeUnitKey = "years" | "months" | "days" | "hours" | "mins" | "secs";

const MS_PER_DAY = 86_400_000;

interface AnniversaryInfo {
  type: "30-day" | "year";
  ordinal: number; // 1-month → 1; 5-month → 5; 1-year → 1
  daysAway: number;
  /** Exact ms timestamp of the milestone moment. */
  at: number;
  label: string; // e.g. "5-month mark", "1-year mark"
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Returns the next upcoming anniversary — whichever comes sooner between
 * the next 30-day milestone and the next yearly anniversary. If today is
 * exactly a milestone, `daysAway` is 0.
 *
 * Day arithmetic uses local-time floor; the dashboard already runs in
 * the user's locale and the anniversary window is whole-day granularity.
 */
function nextAnniversary(now: Date, start: Date): AnniversaryInfo | null {
  const diffMs = now.getTime() - start.getTime();
  if (diffMs < 0) return null;
  const daysSinceStart = Math.floor(diffMs / MS_PER_DAY);

  // Next 30-day milestone (1-month, 2-month, …).
  let next30Ordinal: number;
  let days30Away: number;
  if (daysSinceStart > 0 && daysSinceStart % 30 === 0) {
    next30Ordinal = daysSinceStart / 30;
    days30Away = 0;
  } else {
    next30Ordinal = Math.floor(daysSinceStart / 30) + 1;
    days30Away = next30Ordinal * 30 - daysSinceStart;
  }

  // Next yearly anniversary on `start.getMonth()` / `start.getDate()`.
  const startMonth = start.getMonth();
  const startDay = start.getDate();
  const candidateThisYear = new Date(
    now.getFullYear(),
    startMonth,
    startDay,
    0,
    0,
    0,
    0,
  );
  let nextYearAnniv: Date;
  if (
    isSameDay(candidateThisYear, now) ||
    candidateThisYear.getTime() > now.getTime()
  ) {
    nextYearAnniv = candidateThisYear;
  } else {
    nextYearAnniv = new Date(
      now.getFullYear() + 1,
      startMonth,
      startDay,
      0,
      0,
      0,
      0,
    );
  }
  let yearOrdinal = nextYearAnniv.getFullYear() - start.getFullYear();
  if (yearOrdinal < 1) {
    nextYearAnniv = new Date(
      start.getFullYear() + 1,
      startMonth,
      startDay,
      0,
      0,
      0,
      0,
    );
    yearOrdinal = 1;
  }
  const daysYearAway = isSameDay(nextYearAnniv, now)
    ? 0
    : Math.ceil(
        (nextYearAnniv.getTime() - now.getTime()) / MS_PER_DAY,
      );

  if (daysYearAway < days30Away) {
    return {
      type: "year",
      ordinal: yearOrdinal,
      daysAway: daysYearAway,
      at: nextYearAnniv.getTime(),
      label: `${yearOrdinal}-year mark`,
    };
  }
  return {
    type: "30-day",
    ordinal: next30Ordinal,
    daysAway: days30Away,
    at: start.getTime() + next30Ordinal * 30 * MS_PER_DAY,
    label: `${next30Ordinal}-month mark`,
  };
}

export function CounterCard() {
  const [activeUnit, setActiveUnit] = useState<TimeUnitKey>("days");
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = now.getTime() - START_DATE.getTime();

  const totalSeconds = Math.floor(diff / 1000);
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));

  let tempDateTotalMonths = new Date(START_DATE);
  let totalMonths = 0;
  while (true) {
    const nextMonth = new Date(tempDateTotalMonths);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    if (nextMonth > now) break;
    tempDateTotalMonths = nextMonth;
    totalMonths++;
  }

  let tempDateTotalYears = new Date(START_DATE);
  let totalYears = 0;
  while (true) {
    const nextYear = new Date(tempDateTotalYears);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    if (nextYear > now) break;
    tempDateTotalYears = nextYear;
    totalYears++;
  }

  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  let tempDateBreakdown = new Date(START_DATE);

  let breakdownYears = 0;
  while (true) {
    const nextYear = new Date(tempDateBreakdown);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    if (nextYear > now) break;
    tempDateBreakdown = nextYear;
    breakdownYears++;
  }

  let breakdownMonths = 0;
  while (true) {
    const nextMonth = new Date(tempDateBreakdown);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    if (nextMonth > now) break;
    tempDateBreakdown = nextMonth;
    breakdownMonths++;
  }

  const remainingDiff = now.getTime() - tempDateBreakdown.getTime();
  const breakdownDays = Math.floor(remainingDiff / (1000 * 60 * 60 * 24));

  const activeValueMap: Record<TimeUnitKey, number> = {
    years: totalYears,
    months: totalMonths,
    days: totalDays,
    hours: totalHours,
    mins: totalMinutes,
    secs: totalSeconds,
  };

  const activeLabelMap: Record<TimeUnitKey, string> = {
    years: "years",
    months: "months",
    days: "days",
    hours: "hours",
    mins: "minutes",
    secs: "seconds",
  };

  const formattedHeroValue = new Intl.NumberFormat("en-US").format(
    activeValueMap[activeUnit],
  );

  const handleUnitChange = (unit: TimeUnitKey) => {
    void vibrate(50, "medium");
    setActiveUnit(unit);
  };

  const anniversary = nextAnniversary(now, START_DATE);
  const isAnniversaryToday = anniversary?.daysAway === 0;

  // Remaining-time breakdown so the anniversary block can mirror the
  // main hero's active unit. When the milestone is today (or the time
  // moment has already passed but the day is the same) we render the
  // celebration state instead of the unit-converted countdown.
  const remainingMs = anniversary
    ? Math.max(0, anniversary.at - now.getTime())
    : 0;
  const remainingTotalSeconds = Math.floor(remainingMs / 1000);
  const remainingTotalMinutes = Math.floor(remainingTotalSeconds / 60);
  const remainingTotalHours = Math.floor(remainingTotalSeconds / 3600);
  const remainingTotalDays = Math.floor(remainingTotalSeconds / 86_400);
  const remainingTotalMonths = Math.floor(remainingTotalDays / 30);
  const remainingTotalYears = Math.floor(remainingTotalDays / 365);

  const remainingValueMap: Record<TimeUnitKey, number> = {
    years: remainingTotalYears,
    months: remainingTotalMonths,
    days: remainingTotalDays,
    hours: remainingTotalHours,
    mins: remainingTotalMinutes,
    secs: remainingTotalSeconds,
  };

  const formattedRemainingValue = new Intl.NumberFormat("en-US").format(
    remainingValueMap[activeUnit],
  );

  return (
    <div
      className={cn(
        "relative flex w-full flex-col justify-between overflow-hidden",
        "rounded-[2.5rem] border border-white/5 bg-card/40 p-10",
        "backdrop-blur-xl shadow-2xl shadow-black/40 transition-colors",
        "hover:border-primary/20",
      )}
    >
      <div className="absolute -right-20 -top-20 h-72 w-72">
        <div className="h-full w-full rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 mb-16">
        <div className="mb-6 flex items-center gap-3">
          <Heart className="h-5 w-5 text-primary" fill="currentColor" />
          <h2
            className={cn(
              "text-sm font-bold uppercase tracking-[0.25em]",
              "text-muted-foreground",
            )}
          >
            {COUNTER_LABEL}
          </h2>
        </div>

        <div className="flex flex-col gap-3 md:h-32 md:flex-row md:items-end md:justify-between md:gap-4">
          <div className="flex min-w-0 items-baseline gap-4">
            <AnimatePresence mode="popLayout">
              <motion.span
                key={activeUnit}
                initial={{ y: 20, opacity: 0, filter: "blur(4px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: -20, opacity: 0, filter: "blur(4px)" }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className={cn(
                  "inline-block text-7xl font-black tracking-tighter md:text-8xl",
                  (activeUnit === "secs" || activeUnit === "mins") &&
                    "text-5xl md:text-7xl",
                )}
              >
                {formattedHeroValue}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={`${activeUnit}-label`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="inline-block text-xl font-medium text-muted-foreground md:text-2xl"
              >
                {activeLabelMap[activeUnit]}
              </motion.span>
            </AnimatePresence>
          </div>

          {anniversary && (
            <div
              className="flex flex-col items-end text-right md:shrink-0 md:pb-2"
              aria-label={
                isAnniversaryToday
                  ? `${anniversary.label} is today`
                  : `Next anniversary: ${anniversary.label} in ${anniversary.daysAway} day${anniversary.daysAway === 1 ? "" : "s"}`
              }
            >
              {isAnniversaryToday ? (
                <span
                  className={cn(
                    "text-2xl font-bold tracking-tight text-primary md:text-3xl",
                    "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]",
                  )}
                >
                  Today
                </span>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={`${activeUnit}-anniv`}
                      initial={{ y: 12, opacity: 0, filter: "blur(2px)" }}
                      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                      exit={{ y: -12, opacity: 0, filter: "blur(2px)" }}
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      className="text-3xl font-bold tracking-tight text-primary md:text-4xl"
                    >
                      {formattedRemainingValue}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-xs font-medium text-muted-foreground/60 md:text-sm">
                    {activeLabelMap[activeUnit]}
                  </span>
                </div>
              )}
              <span
                className={cn(
                  "mt-1 text-[10px] font-bold uppercase tracking-widest",
                  isAnniversaryToday
                    ? "text-primary/80"
                    : "text-muted-foreground/50",
                )}
              >
                {isAnniversaryToday
                  ? anniversary.label
                  : `to ${anniversary.label}`}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 text-xs font-medium text-muted-foreground/30">
          Since{" "}
          {new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }).format(START_DATE)}
        </p>
      </div>

      <div
        className={cn(
          "relative z-10 grid grid-cols-3 gap-2 gap-y-8",
          "md:grid-cols-6 md:gap-4",
        )}
      >
        <TimeUnit
          label="Years"
          value={breakdownYears}
          isActive={activeUnit === "years"}
          onClick={() => handleUnitChange("years")}
        />
        <TimeUnit
          label="Months"
          value={breakdownMonths}
          isActive={activeUnit === "months"}
          onClick={() => handleUnitChange("months")}
        />
        <TimeUnit
          label="Days"
          value={breakdownDays}
          isActive={activeUnit === "days"}
          onClick={() => handleUnitChange("days")}
        />
        <TimeUnit
          label="Hours"
          value={hours}
          isActive={activeUnit === "hours"}
          onClick={() => handleUnitChange("hours")}
        />
        <TimeUnit
          label="Mins"
          value={minutes}
          isActive={activeUnit === "mins"}
          onClick={() => handleUnitChange("mins")}
        />
        <TimeUnit
          label="Secs"
          value={seconds}
          color="text-primary"
          isActive={activeUnit === "secs"}
          onClick={() => handleUnitChange("secs")}
        />
      </div>
    </div>
  );
}

function TimeUnit({
  label,
  value,
  color = "text-foreground",
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  color?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col items-center justify-center",
        "rounded-xl py-3 transition-all duration-300 focus-visible:outline-none",
        isActive ? "opacity-100" : "opacity-50 hover:opacity-100",
        !isActive && "hover:-translate-y-1",
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-indicator"
          className="absolute inset-0 rounded-xl bg-primary/10"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <span
        className={cn("relative z-10 text-3xl font-bold tracking-tight", color)}
      >
        {value}
      </span>
      <span
        className={cn(
          "relative z-10 mt-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}
