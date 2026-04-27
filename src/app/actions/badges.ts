"use server";

import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth-utils";
import type { Task } from "@/app/actions/tasks";
import type { Rule } from "@/app/actions/rules";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface NavBadges {
  pendingTasks: number;
  unacknowledgedRules: number;
}

/**
 * Returns unread badge counts for the floating navbar.
 * Only meaningful for Besho — T7SEN always gets zeroes.
 */
export async function getNavBadges(): Promise<NavBadges> {
  const EMPTY: NavBadges = { pendingTasks: 0, unacknowledgedRules: 0 };

  const cookieStore = await cookies();
  const value = cookieStore.get("session")?.value;
  if (!value) return EMPTY;

  const session = await decrypt(value);
  if (session?.author !== "Besho") return EMPTY;

  try {
    const [taskIds, ruleIds] = await Promise.all([
      redis.zrange("tasks:index", 0, -1) as Promise<string[]>,
      redis.zrange("rules:index", 0, -1) as Promise<string[]>,
    ]);

    const [tasks, rules] = await Promise.all([
      taskIds.length
        ? redis.mget<(Pick<Task, "completed"> | null)[]>(
            ...taskIds.map((id) => `task:${id}`),
          )
        : Promise.resolve([]),
      ruleIds.length
        ? redis.mget<(Pick<Rule, "status"> | null)[]>(
            ...ruleIds.map((id) => `rule:${id}`),
          )
        : Promise.resolve([]),
    ]);

    return {
      pendingTasks: tasks.filter((t) => t !== null && !t.completed).length,
      unacknowledgedRules: rules.filter(
        (r) => r !== null && r.status === "pending",
      ).length,
    };
  } catch {
    return EMPTY;
  }
}