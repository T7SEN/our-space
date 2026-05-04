"use client";

import { motion } from "motion/react";
import { Cake, CalendarHeart, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIRTHDAYS, START_DATE } from "@/lib/constants";
import { vibrate } from "@/lib/haptic";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ── Zodiac ────────────────────────────────────────────────────────────────────

interface ZodiacSign {
  name: string;
  symbol: string;
  emoji: string;
}

function getZodiac(month: number, day: number): ZodiacSign {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
    return { name: "Aries", symbol: "♈", emoji: "🐏" };
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
    return { name: "Taurus", symbol: "♉", emoji: "🐂" };
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
    return { name: "Gemini", symbol: "♊", emoji: "👯" };
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
    return { name: "Cancer", symbol: "♋", emoji: "🦀" };
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
    return { name: "Leo", symbol: "♌", emoji: "🦁" };
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
    return { name: "Virgo", symbol: "♍", emoji: "👧" };
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
    return { name: "Libra", symbol: "♎", emoji: "⚖️" };
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
    return { name: "Scorpio", symbol: "♏", emoji: "🦂" };
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
    return { name: "Sagittarius", symbol: "♐", emoji: "🏹" };
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
    return { name: "Capricorn", symbol: "♑", emoji: "🐐" };
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
    return { name: "Aquarius", symbol: "♒", emoji: "🏺" };
  return { name: "Pisces", symbol: "♓", emoji: "🐟" };
}

// ── Memory quotes ─────────────────────────────────────────────────────────────

const MEMORY_QUOTES = [
  "Every birthday with you is my favorite yet.",
  "Another year of you is the best gift I could ask for.",
  "You were born, and the world got a little better that day.",
  "I am so grateful you exist in my world.",
  "Counting down to celebrating you again.",
  "Your birthday is my favorite day to make you feel loved.",
  "Another year, another reason to fall for you.",
  "I hope every birthday feels as special as you make me feel.",
];

// ── Age calculation ───────────────────────────────────────────────────────────

function calcAge(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  now: Date,
): number {
  const age = now.getFullYear() - birthYear;
  const hasBirthdayPassed =
    now.getMonth() + 1 > birthMonth ||
    (now.getMonth() + 1 === birthMonth && now.getDate() >= birthDay);
  return hasBirthdayPassed ? age : age - 1;
}

function getDaysLeft(now: Date, month: number, day: number): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export function BirthdayCard() {
  const now = new Date();
  const myDaysLeft = getDaysLeft(now, BIRTHDAYS.me.month, BIRTHDAYS.me.day);
  const partnerDaysLeft = getDaysLeft(
    now,
    BIRTHDAYS.partner.month,
    BIRTHDAYS.partner.day,
  );

  const myProgress = Math.round(((365 - myDaysLeft) / 365) * 100);
  const partnerProgress = Math.round(((365 - partnerDaysLeft) / 365) * 100);

  const myAge = calcAge(
    BIRTHDAYS.me.year,
    BIRTHDAYS.me.month,
    BIRTHDAYS.me.day,
    now,
  );
  const partnerAge = calcAge(
    BIRTHDAYS.partner.year,
    BIRTHDAYS.partner.month,
    BIRTHDAYS.partner.day,
    now,
  );

  const myZodiac = getZodiac(BIRTHDAYS.me.month, BIRTHDAYS.me.day);
  const partnerZodiac = getZodiac(
    BIRTHDAYS.partner.month,
    BIRTHDAYS.partner.day,
  );

  // Rotate daily
  const daysSinceEpoch = Math.floor(
    (now.getTime() - START_DATE.getTime()) / 86_400_000,
  );
  const quote = MEMORY_QUOTES[Math.abs(daysSinceEpoch) % MEMORY_QUOTES.length];

  const renderPerson = (
    label: string,
    daysLeft: number,
    progress: number,
    age: number,
    isPartner: boolean,
    month: number,
    day: number,
    year: number,
    zodiac: ZodiacSign,
  ) => {
    const isToday = daysLeft === 0;
    const monthName = MONTH_NAMES[month - 1];
    const monthDay = `${monthName} ${day}`;
    const fullDate = `${monthName} ${day}, ${year}`;
    const turningAge = isToday ? age : age + 1;

    return (
      <div className="flex flex-1 flex-col justify-between gap-4">
        {/* Label */}
        <p
          className={cn(
            "text-xs font-bold uppercase tracking-wider",
            isPartner ? "text-primary/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>

        {/* Icon + count */}
        <div
          className="flex cursor-default items-start gap-4"
          onClick={() => isToday && void vibrate([10, 50, 10])}
        >
          <motion.div
            className="mt-1"
            animate={isToday ? { y: [-2, 2, -2], rotate: [-5, 5, -5] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {isToday ? (
              <Cake
                className={cn(
                  "h-8 w-8",
                  isPartner ? "text-primary" : "text-foreground",
                )}
              />
            ) : (
              <Gift
                className={cn(
                  "h-8 w-8",
                  isPartner ? "text-primary/60" : "text-muted-foreground/60",
                )}
              />
            )}
          </motion.div>

          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  "text-3xl font-bold tracking-tighter",
                  isPartner && "text-primary",
                )}
              >
                {isToday ? "Today!" : daysLeft}
              </span>
              {!isToday && (
                <span className="text-sm font-medium text-muted-foreground">
                  days
                </span>
              )}
            </div>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "mt-1 cursor-help text-xs font-semibold transition-colors",
                      isPartner
                        ? "text-primary/70 hover:text-primary"
                        : "text-foreground/70 hover:text-foreground",
                    )}
                  >
                    {monthDay}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="border-white/10 bg-black/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-xl backdrop-blur-md"
                >
                  Born {fullDate}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Year progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              {isToday ? "Year complete" : `${progress}% through year`}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground/50">
              Turning {turningAge}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full",
                isPartner ? "bg-primary/70" : "bg-foreground/40",
              )}
            />
          </div>
        </div>

        {/* Zodiac */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2",
            isPartner ? "bg-primary/8" : "bg-white/3",
          )}
        >
          <span className="text-base leading-none">{zodiac.emoji}</span>
          <p
            className={cn(
              "text-[10px] font-black uppercase tracking-widest",
              isPartner ? "text-primary/60" : "text-muted-foreground/50",
            )}
          >
            {zodiac.symbol} {zodiac.name}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col justify-between overflow-hidden",
        "rounded-3xl border border-white/5 bg-card/40 p-8",
        "backdrop-blur-xl shadow-xl shadow-black/20 transition-colors",
        "hover:border-primary/20",
      )}
    >
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Upcoming Birthdays
        </h2>
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <CalendarHeart className="h-4 w-4" />
        </div>
      </div>

      {/* Birthday columns */}
      <div className="relative z-10 mt-6 flex flex-1 gap-6 divide-x divide-border/40">
        <div className="flex flex-1 flex-col pr-6">
          {renderPerson(
            BIRTHDAYS.me.label,
            myDaysLeft,
            myProgress,
            myAge,
            false,
            BIRTHDAYS.me.month,
            BIRTHDAYS.me.day,
            BIRTHDAYS.me.year,
            myZodiac,
          )}
        </div>
        <div className="flex flex-1 flex-col pl-6">
          {renderPerson(
            BIRTHDAYS.partner.label,
            partnerDaysLeft,
            partnerProgress,
            partnerAge,
            true,
            BIRTHDAYS.partner.month,
            BIRTHDAYS.partner.day,
            BIRTHDAYS.partner.year,
            partnerZodiac,
          )}
        </div>
      </div>

      {/* Memory quote */}
      <div className="relative z-10 mt-6 border-t border-border/20 pt-5">
        <p className="text-center font-serif text-xs italic leading-relaxed text-muted-foreground/50">
          &ldquo;{quote}&rdquo;
        </p>
      </div>
    </div>
  );
}
