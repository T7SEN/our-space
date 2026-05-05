// src/app/actions/admin.ts
"use server";

import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  decrypt,
  readAllSessionEpochs,
  revokeAuthorSessions,
  type SessionPayload,
} from "@/lib/auth-utils";
import { logger } from "@/lib/logger";
import { getActivity, clearActivity, type ActivityRecord } from "@/lib/activity";
import {
  listTrash,
  restoreFromTrash,
  deleteTrashEntry,
  purgeTrash,
  type TrashEntry,
  type TrashFeature,
} from "@/lib/trash";
import type { Author } from "@/lib/constants";
import { sendNotification } from "./notifications";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const PRESENCE_FRESH_MS = 12_000;

async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get("session")?.value;
  if (!value) return null;
  return decrypt(value);
}

async function requireSir(): Promise<
  | { ok: true; session: SessionPayload }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.author) return { ok: false, error: "Not authenticated." };
  if (session.author !== "T7SEN") return { ok: false, error: "Forbidden." };
  return { ok: true, session };
}

// ──────────────────────────────────────────────────────────────────
// Inspector — presence + push state for both authors.
// ──────────────────────────────────────────────────────────────────

export interface PresenceInfo {
  author: Author;
  page: string | null;
  ts: number | null;
  fresh: boolean;
}

export interface PushInfo {
  author: Author;
  hasToken: boolean;
  preview: string | null;
}

export interface InspectorSnapshot {
  presence: PresenceInfo[];
  push: PushInfo[];
  capturedAt: number;
}

export interface InspectorResult {
  snapshot?: InspectorSnapshot;
  error?: string;
}

/** Read-only snapshot of presence + push token state. Sir-only. */
export async function getInspectorSnapshot(): Promise<InspectorResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  const authors: Author[] = ["T7SEN", "Besho"];
  const now = Date.now();

  const [presenceRaw, pushRaw] = await Promise.all([
    Promise.all(
      authors.map((a) => redis.get<string | { page: string; ts: number }>(
        `presence:${a}`,
      )),
    ),
    Promise.all(authors.map((a) => redis.get<string>(`push:fcm:${a}`))),
  ]);

  const presence: PresenceInfo[] = authors.map((author, i) => {
    const raw = presenceRaw[i];
    let page: string | null = null;
    let ts: number | null = null;
    if (raw) {
      try {
        const obj =
          typeof raw === "string"
            ? (JSON.parse(raw) as { page: string; ts: number })
            : raw;
        page = obj.page ?? null;
        ts = obj.ts ?? null;
      } catch {
        // legacy format — leave null
      }
    }
    return {
      author,
      page,
      ts,
      fresh: ts != null && now - ts < PRESENCE_FRESH_MS,
    };
  });

  const push: PushInfo[] = authors.map((author, i) => {
    const v = pushRaw[i];
    return {
      author,
      hasToken: typeof v === "string" && v.length > 0,
      preview:
        typeof v === "string" && v.length > 12
          ? `${v.slice(0, 8)}…${v.slice(-4)}`
          : null,
    };
  });

  return { snapshot: { presence, push, capturedAt: now } };
}

// ──────────────────────────────────────────────────────────────────
// Summon kitten — bypass presence + safeword channel + max priority.
// Possessive, dominant copy. Mirrors the safeword delivery shape but
// fires from Sir to Besho instead of the other way around.
// ──────────────────────────────────────────────────────────────────

export interface SummonResult {
  success?: boolean;
  error?: string;
}

export async function summonKitten(): Promise<SummonResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  try {
    await sendNotification(
      "Besho",
      {
        title: "Heel, kitten.",
        body: "You're mine. Drop everything and come to me — now.",
        url: "/",
      },
      {
        bypassPresence: true,
        android: {
          channelId: "safeword",
          priority: "max",
          sound: "default",
        },
      },
    );
    logger.interaction("[admin] kitten summoned", {
      by: guard.session.author,
    });
    return { success: true };
  } catch (err) {
    logger.error("[admin] summon failed", err, {
      by: guard.session.author,
    });
    return { error: "Summon failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Send test push — wrap sendNotification with a Sir-only form.
// ──────────────────────────────────────────────────────────────────

export interface SendTestPushResult {
  success?: boolean;
  error?: string;
}

export async function sendTestPushAction(
  _prevState: unknown,
  formData: FormData,
): Promise<SendTestPushResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  const to = formData.get("to");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const urlRaw = String(formData.get("url") ?? "").trim();
  const url = urlRaw.length > 0 ? urlRaw : "/";

  if (to !== "T7SEN" && to !== "Besho") {
    return { error: "Pick a recipient." };
  }
  if (title.length === 0) return { error: "Title is required." };
  if (title.length > 80) return { error: "Title is too long (max 80)." };
  if (body.length === 0) return { error: "Body is required." };
  if (body.length > 240) return { error: "Body is too long (max 240)." };
  if (url.length > 200) return { error: "URL is too long (max 200)." };

  try {
    await sendNotification(
      to,
      { title, body, url },
      { bypassPresence: true },
    );
    logger.interaction("[admin] test push sent", {
      to,
      title,
      url,
      by: guard.session.author,
    });
    return { success: true };
  } catch (err) {
    logger.error("[admin] test push failed", err, { to, by: guard.session.author });
    return { error: "Send failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Activity feed — read + clear.
// ──────────────────────────────────────────────────────────────────

export interface ActivityResult {
  records?: ActivityRecord[];
  error?: string;
}

export async function getActivityFeed(
  limit = 200,
): Promise<ActivityResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    return { records: await getActivity(limit) };
  } catch (err) {
    logger.error("[admin] activity read failed", err);
    return { error: "Failed to load activity." };
  }
}

export async function clearActivityFeed(): Promise<{
  success?: boolean;
  error?: string;
  deletedCount?: number;
}> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const n = await clearActivity();
    logger.interaction("[admin] activity cleared", {
      by: guard.session.author,
      deletedCount: n,
    });
    revalidatePath("/admin/activity");
    return { success: true, deletedCount: n };
  } catch (err) {
    logger.error("[admin] activity clear failed", err);
    return { error: "Clear failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Sessions — read epochs + force-logout.
// ──────────────────────────────────────────────────────────────────

export interface SessionEpochsResult {
  epochs?: Record<Author, number>;
  error?: string;
}

export async function getSessionEpochs(): Promise<SessionEpochsResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  return { epochs: await readAllSessionEpochs() };
}

export async function forceLogoutAuthor(
  author: Author,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  if (author !== "T7SEN" && author !== "Besho") {
    return { error: "Invalid author." };
  }
  try {
    await revokeAuthorSessions(author);
    logger.interaction("[admin] sessions revoked", {
      author,
      by: guard.session.author,
    });
    revalidatePath("/admin/sessions");
    return { success: true };
  } catch (err) {
    logger.error("[admin] revoke failed", err, { author });
    return { error: "Revoke failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// JSON export — dump every feature's index + records.
// ──────────────────────────────────────────────────────────────────

export interface ExportFeatureBlock {
  ids: string[];
  records: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

export interface ExportPayload {
  generatedAt: number;
  generatedBy: Author;
  features: Record<string, ExportFeatureBlock>;
  system: Record<string, unknown>;
}

export interface ExportResult {
  payload?: ExportPayload;
  error?: string;
}

async function dumpZsetIndex(
  indexKey: string,
  recordKeyFn: (id: string) => string,
): Promise<ExportFeatureBlock> {
  const ids = ((await redis.zrange<unknown[]>(indexKey, 0, -1)) ?? []).map(
    String,
  );
  if (!ids.length) return { ids: [], records: {} };
  const values = (await redis.mget<unknown[]>(
    ...ids.map(recordKeyFn),
  )) ?? [];
  const records: Record<string, unknown> = {};
  for (let i = 0; i < ids.length; i++) {
    records[ids[i]] = values[i] ?? null;
  }
  return { ids, records };
}

export async function exportSnapshot(): Promise<ExportResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  try {
    const [
      notes,
      rules,
      tasks,
      ledger,
      timeline,
      permissions,
      rituals,
    ] = await Promise.all([
      dumpZsetIndex("notes:index", (id) => `note:${id}`),
      dumpZsetIndex("rules:index", (id) => `rule:${id}`),
      dumpZsetIndex("tasks:index", (id) => `task:${id}`),
      dumpZsetIndex("ledger:index", (id) => `ledger:${id}`),
      dumpZsetIndex("milestones:index", (id) => `milestone:${id}`),
      dumpZsetIndex("permissions:index", (id) => `permission:${id}`),
      dumpZsetIndex("rituals:index", (id) => `ritual:${id}`),
    ]);

    // Notes extras: reactions per note + pinned set + per-author counts.
    if (notes.ids.length) {
      const reactions = await Promise.all(
        notes.ids.map((id) => redis.hgetall(`reactions:${id}`)),
      );
      const reactionMap: Record<string, unknown> = {};
      for (let i = 0; i < notes.ids.length; i++) {
        reactionMap[notes.ids[i]] = reactions[i] ?? null;
      }
      notes.extras = { reactions: reactionMap };
    }
    const [t7senCount, beshoCount] = await Promise.all([
      redis.get("notes:count:T7SEN"),
      redis.get("notes:count:Besho"),
    ]);
    notes.extras = {
      ...(notes.extras ?? {}),
      counts: { T7SEN: t7senCount ?? 0, Besho: beshoCount ?? 0 },
    };

    // Permissions extras: audits, quotas, auto-rules, denied-hashes.
    if (permissions.ids.length) {
      const audits = (await redis.mget<unknown[]>(
        ...permissions.ids.map((id) => `permission:audit:${id}`),
      )) ?? [];
      const auditMap: Record<string, unknown> = {};
      for (let i = 0; i < permissions.ids.length; i++) {
        auditMap[permissions.ids[i]] = audits[i] ?? null;
      }
      permissions.extras = { audits: auditMap };
    }
    const [quotas, autoRules, deniedHashes] = await Promise.all([
      redis.get("permissions:quotas"),
      redis.get("permissions:auto-rules"),
      redis.get("permissions:denied-hashes"),
    ]);
    permissions.extras = {
      ...(permissions.extras ?? {}),
      quotas: quotas ?? null,
      autoRules: autoRules ?? null,
      deniedHashes: deniedHashes ?? null,
    };

    // Rituals extras: occurrence indexes per ritual + streak keys.
    if (rituals.ids.length) {
      const occurrences = await Promise.all(
        rituals.ids.map((id) =>
          redis.zrange<unknown[]>(`ritual:occurrences:${id}`, 0, -1),
        ),
      );
      const streaks = await Promise.all(
        rituals.ids.map((id) =>
          Promise.all([
            redis.get(`ritual:streak:${id}`),
            redis.get(`ritual:streak:${id}:longest`),
          ]),
        ),
      );
      const occurrenceMap: Record<string, unknown> = {};
      const streakMap: Record<string, unknown> = {};
      for (let i = 0; i < rituals.ids.length; i++) {
        occurrenceMap[rituals.ids[i]] = occurrences[i] ?? [];
        streakMap[rituals.ids[i]] = {
          current: streaks[i][0] ?? 0,
          longest: streaks[i][1] ?? 0,
        };
      }
      rituals.extras = { occurrences: occurrenceMap, streaks: streakMap };
    }

    // Reviews — different shape (composite keys).
    const reviewWeeks = ((await redis.zrange<unknown[]>(
      "reviews:revealed",
      0,
      -1,
    )) ?? []).map(String);
    const reviewIds: string[] = [];
    const reviewRecords: Record<string, unknown> = {};
    if (reviewWeeks.length) {
      const keys: string[] = [];
      for (const week of reviewWeeks) {
        for (const author of ["T7SEN", "Besho"] as const) {
          keys.push(`review:${week}:${author}`);
          reviewIds.push(`${week}:${author}`);
        }
      }
      const values = (await redis.mget<unknown[]>(...keys)) ?? [];
      for (let i = 0; i < reviewIds.length; i++) {
        reviewRecords[reviewIds[i]] = values[i] ?? null;
      }
    }
    const reviews: ExportFeatureBlock = {
      ids: reviewIds,
      records: reviewRecords,
      extras: { weeks: reviewWeeks },
    };

    const [presenceT, presenceB, pushT, pushB, epochs] = await Promise.all([
      redis.get("presence:T7SEN"),
      redis.get("presence:Besho"),
      redis.get<string>("push:fcm:T7SEN"),
      redis.get<string>("push:fcm:Besho"),
      readAllSessionEpochs(),
    ]);

    const payload: ExportPayload = {
      generatedAt: Date.now(),
      generatedBy: guard.session.author,
      features: {
        notes,
        rules,
        tasks,
        ledger,
        timeline,
        permissions,
        rituals,
        reviews,
      },
      system: {
        presence: { T7SEN: presenceT ?? null, Besho: presenceB ?? null },
        // Push tokens are masked in the inspector but retained in full
        // here so a backup can re-seed FCM. The export is Sir-only.
        push: {
          T7SEN: pushT ?? null,
          Besho: pushB ?? null,
        },
        sessionEpochs: epochs,
      },
    };

    logger.interaction("[admin] export generated", {
      by: guard.session.author,
      bytes: JSON.stringify(payload).length,
    });
    return { payload };
  } catch (err) {
    logger.error("[admin] export failed", err);
    return { error: "Export failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Trash — list / restore / permanently delete / purge.
// ──────────────────────────────────────────────────────────────────

export interface TrashListResult {
  entries?: TrashEntry[];
  error?: string;
}

export async function getTrashList(
  feature?: TrashFeature,
): Promise<TrashListResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const entries = await listTrash(redis, { feature, limit: 200 });
    return { entries };
  } catch (err) {
    logger.error("[admin] trash list failed", err);
    return { error: "Failed to load trash." };
  }
}

export async function restoreTrashEntryAction(
  feature: TrashFeature,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const entry = await restoreFromTrash(redis, feature, id);
    if (!entry) return { error: "Already gone or expired." };
    logger.interaction("[admin] trash restored", {
      feature,
      id,
      by: guard.session.author,
    });
    revalidatePath("/admin/trash");
    revalidatePath(`/${feature}`);
    return { success: true };
  } catch (err) {
    logger.error("[admin] restore failed", err, { feature, id });
    return { error: "Restore failed." };
  }
}

export async function deleteTrashEntryAction(
  feature: TrashFeature,
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    await deleteTrashEntry(redis, feature, id);
    logger.interaction("[admin] trash entry deleted", {
      feature,
      id,
      by: guard.session.author,
    });
    revalidatePath("/admin/trash");
    return { success: true };
  } catch (err) {
    logger.error("[admin] trash delete failed", err, { feature, id });
    return { error: "Delete failed." };
  }
}

export async function purgeTrashAction(
  feature?: TrashFeature,
): Promise<{ success?: boolean; error?: string; deletedCount?: number }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const n = await purgeTrash(redis, feature);
    logger.warn("[admin] trash purged", {
      feature: feature ?? "*",
      by: guard.session.author,
      deletedCount: n,
    });
    revalidatePath("/admin/trash");
    return { success: true, deletedCount: n };
  } catch (err) {
    logger.error("[admin] trash purge failed", err, {
      feature: feature ?? "*",
    });
    return { error: "Purge failed." };
  }
}
