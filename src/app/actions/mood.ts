// src/app/actions/mood.ts
"use server";

import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth-utils";
import {
  addDaysCairo,
  secondsUntilCairoMidnight,
  todayKeyCairo,
} from "@/lib/cairo-time";
import { sendNotification } from "@/app/actions/notifications";
import { logger } from "@/lib/logger";

export interface MoodData {
  myMood: string | null;
  partnerMood: string | null;
  myState: string | null;
  partnerState: string | null;
  myHugSent: boolean;
  hugReceivedFrom: string | null;
}

export interface MoodHistoryEntry {
  date: string; // 'YYYY-MM-DD'
  myMood: string | null;
  partnerMood: string | null;
  myState: string | null;
  partnerState: string | null;
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Mood and state keys persist for 7 days so getMoodHistory
// can query past dates. The daily-reset behaviour is unaffected
// because getTodayMoods reads today's date-scoped key only.
const MOOD_RETENTION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

const moodKey = (date: string, author: string) => `mood:${date}:${author}`;
const stateKey = (date: string, author: string) => `state:${date}:${author}`;
const hugKey = (date: string, from: string) => `mood:hug:${date}:${from}`;

async function getSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get("session")?.value;
  if (!value) return null;
  return decrypt(value);
}

export async function getTodayMoods(): Promise<MoodData> {
  const session = await getSession();
  if (!session?.author) {
    return {
      myMood: null,
      partnerMood: null,
      myState: null,
      partnerState: null,
      myHugSent: false,
      hugReceivedFrom: null,
    };
  }

  const author = session.author as "T7SEN" | "Besho";
  const partner = author === "T7SEN" ? "Besho" : "T7SEN";
  const today = todayKeyCairo();

  const [
    myMood,
    partnerMood,
    myState,
    partnerState,
    myHugSent,
    partnerHugSent,
  ] = await Promise.all([
    redis.get<string>(moodKey(today, author)),
    redis.get<string>(moodKey(today, partner)),
    redis.get<string>(stateKey(today, author)),
    redis.get<string>(stateKey(today, partner)),
    redis.get<string>(hugKey(today, author)),
    redis.get<string>(hugKey(today, partner)),
  ]);

  return {
    myMood: myMood ?? null,
    partnerMood: partnerMood ?? null,
    myState: myState ?? null,
    partnerState: partnerState ?? null,
    myHugSent: myHugSent === "1",
    hugReceivedFrom: partnerHugSent === "1" ? partner : null,
  };
}

/**
 * Direct-call action — caller invokes as `submitMood(emoji)`. Not a
 * `useActionState` form action. Returns `{ success?, error? }` per
 * the codebase action contract.
 */
export async function submitMood(
  mood: string,
): Promise<{ success?: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.author) return { error: "Not authenticated." };

  const trimmed = mood?.trim();
  if (!trimmed) return { error: "Mood is required." };

  try {
    const author = session.author as "T7SEN" | "Besho";
    const today = todayKeyCairo();
    const ttl = secondsUntilCairoMidnight();

    await redis.set(moodKey(today, author), trimmed, {
      ex: Math.max(MOOD_RETENTION_TTL, ttl),
    });

    logger.interaction("[mood] Mood set", { author, mood: trimmed });
    return { success: true };
  } catch (error) {
    logger.error("[mood] Failed to set mood:", error);
    return { error: "Failed to set mood." };
  }
}

/**
 * Direct-call action — caller invokes as `submitState(value)`. Not a
 * form action.
 */
export async function submitState(
  value: string,
): Promise<{ success?: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.author) return { error: "Not authenticated." };

  const trimmed = value?.trim();
  if (!trimmed) return { error: "State is required." };

  try {
    const author = session.author as "T7SEN" | "Besho";
    const today = todayKeyCairo();
    const ttl = secondsUntilCairoMidnight();

    await redis.set(stateKey(today, author), trimmed, {
      ex: Math.max(MOOD_RETENTION_TTL, ttl),
    });

    logger.interaction("[mood] State set", { author, state: trimmed });
    return { success: true };
  } catch (error) {
    logger.error("[mood] Failed to set state:", error);
    return { error: "Failed to set state." };
  }
}

export async function sendHug(): Promise<{
  success?: boolean;
  error?: string;
}> {
  const session = await getSession();
  if (!session?.author) return { error: "Not authenticated." };

  try {
    const author = session.author as "T7SEN" | "Besho";
    const partner = author === "T7SEN" ? "Besho" : "T7SEN";
    const today = todayKeyCairo();
    const ttl = secondsUntilCairoMidnight();

    await redis.set(hugKey(today, author), "1", {
      ex: Math.max(MOOD_RETENTION_TTL, ttl),
    });

    await sendNotification(partner, {
      title: "🤗 Hug",
      body: `${author} sent you a hug`,
      url: "/",
    });

    logger.interaction("[mood] Hug sent", { from: author, to: partner });
    return { success: true };
  } catch (error) {
    logger.error("[mood] Failed to send hug:", error);
    return { error: "Failed to send hug." };
  }
}

/**
 * Returns the last `days` days of mood + state data for both users,
 * oldest entry first. Reads up to `days × 4` Redis keys in a single
 * mget call — no N+1. Keys must still exist (MOOD_RETENTION_TTL
 * guarantees they do for 7 days after submission).
 *
 * Bug fix in this revision: the prior implementation used
 * `new Date(); d.setDate(d.getDate() - i)` against server-local time.
 * On Vercel that's UTC, so during early Cairo morning (00:00 → 02:00
 * EET / 03:00 EEST) the day index could be off by one and the grid
 * could miss today's entry. Now anchored at `todayKeyCairo()` and
 * walked via `addDaysCairo`.
 */
export async function getMoodHistory(days = 7): Promise<MoodHistoryEntry[]> {
  const session = await getSession();
  if (!session?.author) return [];

  const author = session.author as "T7SEN" | "Besho";
  const partner = author === "T7SEN" ? "Besho" : "T7SEN";

  const today = todayKeyCairo();
  // Build date strings oldest → newest (today is last).
  const dateStrings = Array.from({ length: days }, (_, i) =>
    addDaysCairo(today, -(days - 1 - i)),
  );

  // Flatten all keys: [myMood, partnerMood, myState, partnerState] × days
  const keys = dateStrings.flatMap((date) => [
    moodKey(date, author),
    moodKey(date, partner),
    stateKey(date, author),
    stateKey(date, partner),
  ]);

  const values = await redis.mget<(string | null)[]>(...keys);

  return dateStrings.map((date, i) => ({
    date,
    myMood: values[i * 4] ?? null,
    partnerMood: values[i * 4 + 1] ?? null,
    myState: values[i * 4 + 2] ?? null,
    partnerState: values[i * 4 + 3] ?? null,
  }));
}
