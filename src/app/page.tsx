/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";
import { getCurrentAuthor } from "@/app/actions/auth";
import { Header } from "@/components/dashboard/header";
import { CounterCard } from "@/components/dashboard/counter-card";
import { WeatherCard } from "@/components/dashboard/weather-card";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { TimezoneCard } from "@/components/dashboard/timezone-card";
import { DistanceCard } from "@/components/dashboard/distance-card";
import { BirthdayCard } from "@/components/dashboard/birthday-card";
import { NotebookCard } from "@/components/dashboard/notebook-card";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  } as any,
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", bounce: 0, duration: 0.8 },
  } as any,
};

export default function Dashboard() {
  const [now, setNow] = useState<Date | null>(null);
  const [author, setAuthor] = useState<string | null>(null);

  useEffect(() => {
    getCurrentAuthor().then(setAuthor);
    const timeoutId = setTimeout(() => setNow(new Date()), 0);
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  if (!now) return <SkeletonLoader />;

  return (
    <div
      className={cn(
        "relative min-h-screen bg-background p-6 md:p-12",
        "overflow-hidden selection:bg-primary/30",
      )}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "absolute left-[-10%] top-0 h-150 w-150",
            "rounded-full bg-primary/10 blur-[150px]",
          )}
        />
        <div
          className={cn(
            "absolute right-[-10%] bottom-0 h-150 w-150",
            "rounded-full bg-blue-500/5 blur-[150px]",
          )}
        />
      </div>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-6xl space-y-10 pb-24 pt-4"
      >
        <motion.div variants={itemVariants}>
          <Header now={now} author={author} />
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* ── Main column — 8 cols ── */}
          <div className="flex flex-col gap-6 lg:col-span-8 lg:gap-8">
            {/* Row 1: Hero counter */}
            <motion.div variants={itemVariants}>
              <CounterCard now={now} />
            </motion.div>

            {/* Row 2: Weather + Quote */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
              <motion.div variants={itemVariants} className="h-full">
                <ErrorBoundary label="Weather">
                  <WeatherCard />
                </ErrorBoundary>
              </motion.div>
              <motion.div variants={itemVariants} className="h-full">
                <ErrorBoundary label="Quote">
                  <QuoteCard />
                </ErrorBoundary>
              </motion.div>
            </div>

            {/* Row 3: Notebook + Distance */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
              <motion.div variants={itemVariants} className="h-full">
                <NotebookCard />
              </motion.div>
              <motion.div variants={itemVariants} className="h-full">
                <DistanceCard />
              </motion.div>
            </div>
          </div>

          {/* ── Sidebar — 4 cols ── */}
          {/* Only live-data cards here so sidebar height matches the main column */}
          <div className="flex flex-col gap-6 lg:col-span-4 lg:gap-8">
            <motion.div variants={itemVariants}>
              <TimezoneCard now={now} />
            </motion.div>
            <motion.div variants={itemVariants}>
              <BirthdayCard now={now} />
            </motion.div>
          </div>
        </div>
      </motion.main>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-6xl animate-pulse space-y-10 pb-24 pt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-10 w-72 rounded-xl bg-card/50" />
            <div className="h-6 w-48 rounded-lg bg-card/50" />
          </div>
          <div className="h-8 w-8 rounded-full bg-card/50" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Main */}
          <div className="flex flex-col gap-6 lg:col-span-8 lg:gap-8">
            <div className="h-100 rounded-[2.5rem] bg-card/50" />
            <div className="grid grid-cols-2 gap-6 lg:gap-8">
              <div className="h-48 rounded-3xl bg-card/50" />
              <div className="h-48 rounded-3xl bg-card/50" />
            </div>
            <div className="grid grid-cols-2 gap-6 lg:gap-8">
              <div className="h-48 rounded-3xl bg-card/50" />
              <div className="h-48 rounded-3xl bg-card/50" />
            </div>
          </div>

          {/* Sidebar — 2 cards to match real layout */}
          <div className="flex flex-col gap-6 lg:col-span-4 lg:gap-8">
            <div className="h-64 rounded-3xl bg-card/50" />
            <div className="h-48 rounded-3xl bg-card/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
