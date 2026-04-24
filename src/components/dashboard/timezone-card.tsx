"use client";

import { Clock, Sun, Moon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { MY_TZ, PARTNER_TZ } from "@/lib/constants";

export function TimezoneCard({ now }: { now: Date }) {
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
  });

  const minuteFormatter = new Intl.DateTimeFormat("en-US", {
    minute: "2-digit",
  });

  const amPmFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
  });

  // --- Cairo Calculations ---
  const myDate = new Date(now.toLocaleString("en-US", { timeZone: MY_TZ }));
  const myHour24 = parseInt(hourFormatter.format(myDate));
  const myMinute = parseInt(minuteFormatter.format(myDate));
  const myAmPm = amPmFormatter.format(myDate).split(" ")[1];

  const myHour12 = myHour24 % 12 || 12;
  const myIsDay = myHour24 >= 6 && myHour24 < 18;
  const myProgress = ((myHour24 * 60 + myMinute) / 1440) * 100;

  // --- Riyadh Calculations ---
  const partnerDate = new Date(
    now.toLocaleString("en-US", { timeZone: PARTNER_TZ }),
  );
  const partnerHour24 = parseInt(hourFormatter.format(partnerDate));
  const partnerMinute = parseInt(minuteFormatter.format(partnerDate));
  const partnerAmPm = amPmFormatter.format(partnerDate).split(" ")[1];

  const partnerHour12 = partnerHour24 % 12 || 12;
  const partnerIsDay = partnerHour24 >= 6 && partnerHour24 < 18;
  const partnerProgress = ((partnerHour24 * 60 + partnerMinute) / 1440) * 100;

  return (
    <div
      className={cn(
        "flex flex-col gap-8 rounded-3xl border border-white/5",
        "bg-card/40 p-8 backdrop-blur-xl shadow-xl shadow-black/20",
        "transition-colors hover:border-primary/20",
      )}
    >
      <div className="flex items-center justify-between">
        <h2
          className={cn(
            "text-xs font-bold uppercase tracking-[0.2em]",
            "text-muted-foreground",
          )}
        >
          Timezones
        </h2>
        <Clock className="h-4 w-4 text-muted-foreground/50" />
      </div>

      <div className="space-y-8">
        {/* Cairo Section */}
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p
                className={cn(
                  "mb-1 text-xs font-bold uppercase",
                  "tracking-wider text-muted-foreground",
                )}
              >
                Al Shorouk, Egypt
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-3xl font-bold tracking-tight",
                    "text-foreground",
                  )}
                >
                  {myHour12}
                  <span className="inline-block -translate-y-0.5">:</span>
                  {myMinute.toString().padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  {myAmPm}
                </span>
              </div>
            </div>
            <div className="rounded-full bg-background/50 p-2.5 shadow-inner">
              {myIsDay ? (
                <Sun className="h-5 w-5 text-yellow-500/90" />
              ) : (
                <Moon className="h-5 w-5 text-blue-400/90" />
              )}
            </div>
          </div>
          {/* Daylight Progress Track */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${myProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full",
                myIsDay ? "bg-yellow-500/50" : "bg-blue-500/50",
              )}
            />
          </div>
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Riyadh Section */}
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p
                className={cn(
                  "mb-1 text-xs font-bold uppercase tracking-wider",
                  "text-primary/80",
                )}
              >
                Tabuk, KSA
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-3xl font-bold tracking-tight",
                    "text-primary",
                  )}
                >
                  {partnerHour12}
                  <span className="inline-block -translate-y-0.5">:</span>
                  {partnerMinute.toString().padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-primary/60">
                  {partnerAmPm}
                </span>
              </div>
            </div>
            <div className="rounded-full bg-primary/10 p-2.5 shadow-inner">
              {partnerIsDay ? (
                <Sun className="h-5 w-5 text-yellow-500/90" />
              ) : (
                <Moon className="h-5 w-5 text-blue-400/90" />
              )}
            </div>
          </div>
          {/* Daylight Progress Track */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${partnerProgress}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]",
                partnerIsDay ? "bg-yellow-500/80" : "bg-blue-500/80",
                "shadow-current",
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
