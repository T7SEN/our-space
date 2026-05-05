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
import { type DeviceRecord, DEVICE_FRESH_MS } from "@/lib/device-types";
import {
  readRestraintRaw,
  setRestraintRaw,
} from "@/lib/restraint";
import { todayKeyCairo } from "@/lib/cairo-time";
import { sendNotification } from "./notifications";
import type { AuthFailureRecord } from "./auth";

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
// Restraint mode — Besho's read-only flag.
// ──────────────────────────────────────────────────────────────────

export interface RestraintStateResult {
  on?: boolean;
  error?: string;
}

export async function getRestraintState(): Promise<RestraintStateResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  return { on: await readRestraintRaw() };
}

export async function setRestraintState(
  on: boolean,
): Promise<{ success?: boolean; error?: string; on?: boolean }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    await setRestraintRaw(on);
    logger.interaction("[admin] restraint toggled", {
      on,
      by: guard.session.author,
    });
    revalidatePath("/admin");
    return { success: true, on };
  } catch (err) {
    logger.error("[admin] restraint toggle failed", err);
    return { error: "Toggle failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Auth failure log — Sir-only reader / clearer.
// ──────────────────────────────────────────────────────────────────

export interface AuthFailuresResult {
  records?: AuthFailureRecord[];
  error?: string;
}

export async function getAuthFailures(
  limit = 100,
): Promise<AuthFailuresResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const raw = ((await redis.zrange<unknown[]>(
      "auth:failures",
      0,
      limit - 1,
      { rev: true },
    )) ?? []) as unknown[];
    const out: AuthFailureRecord[] = [];
    for (const v of raw) {
      if (typeof v === "string") {
        try {
          out.push(JSON.parse(v) as AuthFailureRecord);
        } catch {
          // skip malformed
        }
      } else if (v && typeof v === "object") {
        out.push(v as AuthFailureRecord);
      }
    }
    return { records: out };
  } catch (err) {
    logger.error("[admin] auth failures read failed", err);
    return { error: "Failed to read auth log." };
  }
}

export async function clearAuthFailures(): Promise<{
  success?: boolean;
  error?: string;
  deletedCount?: number;
}> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const count = (await redis.zcard("auth:failures")) ?? 0;
    await redis.del("auth:failures");
    logger.interaction("[admin] auth log cleared", {
      by: guard.session.author,
      deletedCount: count,
    });
    revalidatePath("/admin/auth-log");
    return {
      success: true,
      deletedCount: typeof count === "number" ? count : 0,
    };
  } catch (err) {
    logger.error("[admin] auth log clear failed", err);
    return { error: "Clear failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Relationship dates — start date + per-author birthdays.
// ──────────────────────────────────────────────────────────────────

export interface RelationshipDatesResult {
  dates?: {
    relationshipStart: string | null;
    birthdayT7SEN: string | null;
    birthdayBesho: string | null;
  };
  error?: string;
}

export async function getRelationshipDates(): Promise<RelationshipDatesResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  try {
    const [start, t, b] = await Promise.all([
      redis.get<string>("relationship:start"),
      redis.get<string>("birthday:T7SEN"),
      redis.get<string>("birthday:Besho"),
    ]);
    return {
      dates: {
        relationshipStart: start ?? null,
        birthdayT7SEN: t ?? null,
        birthdayBesho: b ?? null,
      },
    };
  } catch (err) {
    logger.error("[admin] dates read failed", err);
    return { error: "Failed to read dates." };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function setRelationshipDates(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  const start = String(formData.get("relationshipStart") ?? "").trim();
  const t = String(formData.get("birthdayT7SEN") ?? "").trim();
  const b = String(formData.get("birthdayBesho") ?? "").trim();

  for (const v of [start, t, b]) {
    if (v && !ISO_DATE.test(v)) {
      return { error: "Dates must be in YYYY-MM-DD format." };
    }
  }

  try {
    const pipeline = redis.pipeline();
    if (start) pipeline.set("relationship:start", start);
    else pipeline.del("relationship:start");
    if (t) pipeline.set("birthday:T7SEN", t);
    else pipeline.del("birthday:T7SEN");
    if (b) pipeline.set("birthday:Besho", b);
    else pipeline.del("birthday:Besho");
    await pipeline.exec();

    logger.interaction("[admin] dates updated", {
      by: guard.session.author,
    });
    revalidatePath("/");
    revalidatePath("/admin/dates");
    return { success: true };
  } catch (err) {
    logger.error("[admin] dates write failed", err);
    return { error: "Save failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Mood override — Sir sets / clears either author's mood for any date.
// ──────────────────────────────────────────────────────────────────

export async function adminSetMoodForAuthor(
  author: Author,
  mood: string,
  dateKey?: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  if (author !== "T7SEN" && author !== "Besho") {
    return { error: "Invalid author." };
  }
  const trimmed = mood.trim();
  if (!trimmed) return { error: "Mood is required." };
  if (trimmed.length > 16) return { error: "Mood is too long." };

  const date = dateKey?.trim() || todayKeyCairo();
  if (!ISO_DATE.test(date)) return { error: "Invalid date." };

  try {
    await redis.set(`mood:${date}:${author}`, trimmed);
    logger.interaction("[admin] mood override set", {
      author,
      mood: trimmed,
      date,
      by: guard.session.author,
    });
    revalidatePath("/");
    revalidatePath("/admin/mood");
    return { success: true };
  } catch (err) {
    logger.error("[admin] mood override set failed", err);
    return { error: "Set failed." };
  }
}

export async function adminClearMoodForAuthor(
  author: Author,
  dateKey?: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  if (author !== "T7SEN" && author !== "Besho") {
    return { error: "Invalid author." };
  }
  const date = dateKey?.trim() || todayKeyCairo();
  if (!ISO_DATE.test(date)) return { error: "Invalid date." };

  try {
    await redis.del(`mood:${date}:${author}`);
    logger.interaction("[admin] mood override cleared", {
      author,
      date,
      by: guard.session.author,
    });
    revalidatePath("/");
    revalidatePath("/admin/mood");
    return { success: true };
  } catch (err) {
    logger.error("[admin] mood override clear failed", err);
    return { error: "Clear failed." };
  }
}

export async function adminSetStateForAuthor(
  author: Author,
  state: string,
  dateKey?: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  if (author !== "T7SEN" && author !== "Besho") {
    return { error: "Invalid author." };
  }
  const trimmed = state.trim();
  if (!trimmed) return { error: "State is required." };
  if (trimmed.length > 16) return { error: "State is too long." };

  const date = dateKey?.trim() || todayKeyCairo();
  if (!ISO_DATE.test(date)) return { error: "Invalid date." };

  try {
    await redis.set(`state:${date}:${author}`, trimmed);
    logger.interaction("[admin] state override set", {
      author,
      state: trimmed,
      date,
      by: guard.session.author,
    });
    revalidatePath("/");
    revalidatePath("/admin/mood");
    return { success: true };
  } catch (err) {
    logger.error("[admin] state override set failed", err);
    return { error: "Set failed." };
  }
}

export async function adminClearStateForAuthor(
  author: Author,
  dateKey?: string,
): Promise<{ success?: boolean; error?: string }> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  if (author !== "T7SEN" && author !== "Besho") {
    return { error: "Invalid author." };
  }
  const date = dateKey?.trim() || todayKeyCairo();
  if (!ISO_DATE.test(date)) return { error: "Invalid date." };

  try {
    await redis.del(`state:${date}:${author}`);
    logger.interaction("[admin] state override cleared", {
      author,
      date,
      by: guard.session.author,
    });
    revalidatePath("/");
    revalidatePath("/admin/mood");
    return { success: true };
  } catch (err) {
    logger.error("[admin] state override clear failed", err);
    return { error: "Clear failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Stats dashboard — read-heavy roll-up across every feature.
// ──────────────────────────────────────────────────────────────────

interface RuleLite { status?: string }
interface TaskLite { status?: string }
interface PermissionLite {
  status?: string;
  requestedAt?: number;
  decidedAt?: number;
}
interface LedgerLite { type?: string }
interface RitualLite { active?: boolean; pausedUntil?: number }

export interface StatsSnapshot {
  notes: {
    total: number;
    byAuthor: Record<Author, number>;
    pinnedByAuthor: Record<Author, number>;
  };
  rules: {
    total: number;
    pending: number;
    active: number;
    completed: number;
  };
  tasks: {
    total: number;
    pending: number;
    inReview: number;
    completed: number;
    completionRate: number;
  };
  ledger: { total: number; rewards: number; punishments: number };
  permissions: {
    total: number;
    pending: number;
    approved: number;
    denied: number;
    queued: number;
    withdrawn: number;
    avgDecideLatencyMs: number | null;
  };
  rituals: { total: number; active: number; paused: number };
  reviews: { revealedWeeks: number };
  safeword: {
    total: number;
    last30d: number;
    lastTriggeredAt: number | null;
  };
  devices: { total: number; online: number };
  activity: { last24h: number };
  generatedAt: number;
}

export interface StatsResult {
  stats?: StatsSnapshot;
  error?: string;
}

export async function getStats(): Promise<StatsResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  try {
    const now = Date.now();
    const day30Ago = now - 30 * 86_400_000;
    const day1Ago = now - 86_400_000;

    // Index ids in parallel.
    const [
      noteIds,
      ruleIds,
      taskIds,
      permIds,
      ledgerIds,
      ritualIds,
      reviewWeeks,
      safewordHistory,
      countT,
      countB,
      countPinT,
      countPinB,
      activity24h,
      deviceIdsT,
      deviceIdsB,
    ] = await Promise.all([
      redis.zrange<unknown[]>("notes:index", 0, -1),
      redis.zrange<unknown[]>("rules:index", 0, -1),
      redis.zrange<unknown[]>("tasks:index", 0, -1),
      redis.zrange<unknown[]>("permissions:index", 0, -1),
      redis.zrange<unknown[]>("ledger:index", 0, -1),
      redis.zrange<unknown[]>("rituals:index", 0, -1),
      redis.zrange<unknown[]>("reviews:revealed", 0, -1),
      redis.lrange<{ timestamp?: number }>("safeword:history", 0, -1),
      redis.get<number | string>("notes:count:T7SEN"),
      redis.get<number | string>("notes:count:Besho"),
      // Pinned: counted from per-author pin chips. We count notes that
      // have `pinned: true` after the rules read, so leave 0 here and
      // fill after the mget below.
      Promise.resolve(0),
      Promise.resolve(0),
      redis.zcount("activity:log", day1Ago, "+inf"),
      redis.zrange<unknown[]>("device:list:T7SEN", 0, -1),
      redis.zrange<unknown[]>("device:list:Besho", 0, -1),
    ]);

    // Rules detail — mget records for status counts.
    const ruleIdList = (ruleIds ?? []).map(String);
    const rulesByStatus = { pending: 0, active: 0, completed: 0 };
    if (ruleIdList.length) {
      const recs =
        (await redis.mget<RuleLite[]>(
          ...ruleIdList.map((id) => `rule:${id}`),
        )) ?? [];
      for (const r of recs) {
        const s = r?.status;
        if (s === "pending") rulesByStatus.pending++;
        else if (s === "active") rulesByStatus.active++;
        else if (s === "completed") rulesByStatus.completed++;
      }
    }

    // Tasks detail.
    const taskIdList = (taskIds ?? []).map(String);
    const tasksByStatus = { pending: 0, inReview: 0, completed: 0 };
    if (taskIdList.length) {
      const recs =
        (await redis.mget<TaskLite[]>(
          ...taskIdList.map((id) => `task:${id}`),
        )) ?? [];
      for (const r of recs) {
        const s = r?.status;
        if (s === "pending") tasksByStatus.pending++;
        else if (s === "in_review") tasksByStatus.inReview++;
        else if (s === "completed") tasksByStatus.completed++;
      }
    }

    // Permissions detail — count by status + decide latency average.
    const permIdList = (permIds ?? []).map(String);
    const permsByStatus = {
      pending: 0,
      approved: 0,
      denied: 0,
      queued: 0,
      withdrawn: 0,
    };
    let latencyTotal = 0;
    let latencyCount = 0;
    if (permIdList.length) {
      const recs =
        (await redis.mget<PermissionLite[]>(
          ...permIdList.map((id) => `permission:${id}`),
        )) ?? [];
      for (const r of recs) {
        if (!r) continue;
        const s = r.status;
        if (s === "pending") permsByStatus.pending++;
        else if (s === "approved") permsByStatus.approved++;
        else if (s === "denied") permsByStatus.denied++;
        else if (s === "queued") permsByStatus.queued++;
        else if (s === "withdrawn") permsByStatus.withdrawn++;
        if (
          typeof r.requestedAt === "number" &&
          typeof r.decidedAt === "number" &&
          r.decidedAt > r.requestedAt
        ) {
          latencyTotal += r.decidedAt - r.requestedAt;
          latencyCount++;
        }
      }
    }

    // Ledger detail.
    const ledgerIdList = (ledgerIds ?? []).map(String);
    const ledgerByType = { rewards: 0, punishments: 0 };
    if (ledgerIdList.length) {
      const recs =
        (await redis.mget<LedgerLite[]>(
          ...ledgerIdList.map((id) => `ledger:${id}`),
        )) ?? [];
      for (const r of recs) {
        if (r?.type === "reward") ledgerByType.rewards++;
        else if (r?.type === "punishment") ledgerByType.punishments++;
      }
    }

    // Rituals detail.
    const ritualIdList = (ritualIds ?? []).map(String);
    const ritualState = { active: 0, paused: 0 };
    if (ritualIdList.length) {
      const recs =
        (await redis.mget<RitualLite[]>(
          ...ritualIdList.map((id) => `ritual:${id}`),
        )) ?? [];
      for (const r of recs) {
        if (!r) continue;
        const isPaused =
          typeof r.pausedUntil === "number" && r.pausedUntil > now;
        if (isPaused) ritualState.paused++;
        else if (r.active !== false) ritualState.active++;
      }
    }

    // Notes pinned counts — read all notes (paginated mget).
    const noteIdList = (noteIds ?? []).map(String);
    const pinnedByAuthor: Record<Author, number> = { T7SEN: 0, Besho: 0 };
    if (noteIdList.length) {
      const recs =
        (await redis.mget<{ pinned?: boolean; author?: string }[]>(
          ...noteIdList.map((id) => `note:${id}`),
        )) ?? [];
      for (const r of recs) {
        if (r?.pinned && (r.author === "T7SEN" || r.author === "Besho")) {
          pinnedByAuthor[r.author]++;
        }
      }
    }

    // Safeword detail — list capped at 50 by writer.
    const sw = safewordHistory ?? [];
    const swLast30 = sw.filter(
      (e) => typeof e?.timestamp === "number" && e.timestamp >= day30Ago,
    ).length;
    const swLast = sw.length > 0 ? (sw[0]?.timestamp ?? null) : null;

    // Devices.
    const deviceIds = [
      ...((deviceIdsT ?? []) as unknown[]),
      ...((deviceIdsB ?? []) as unknown[]),
    ].map(String);
    let devicesOnline = 0;
    if (deviceIds.length) {
      const drecs =
        (await redis.mget<DeviceRecord[]>(
          ...deviceIds.map((id) => `device:${id}`),
        )) ?? [];
      for (const d of drecs) {
        if (d && now - d.lastSeenAt < DEVICE_FRESH_MS) devicesOnline++;
      }
    }

    const stats: StatsSnapshot = {
      notes: {
        total: noteIdList.length,
        byAuthor: {
          T7SEN: Number(countT) || 0,
          Besho: Number(countB) || 0,
        },
        pinnedByAuthor,
      },
      rules: {
        total: ruleIdList.length,
        pending: rulesByStatus.pending,
        active: rulesByStatus.active,
        completed: rulesByStatus.completed,
      },
      tasks: {
        total: taskIdList.length,
        pending: tasksByStatus.pending,
        inReview: tasksByStatus.inReview,
        completed: tasksByStatus.completed,
        completionRate:
          taskIdList.length > 0
            ? tasksByStatus.completed / taskIdList.length
            : 0,
      },
      ledger: {
        total: ledgerIdList.length,
        rewards: ledgerByType.rewards,
        punishments: ledgerByType.punishments,
      },
      permissions: {
        total: permIdList.length,
        ...permsByStatus,
        avgDecideLatencyMs:
          latencyCount > 0 ? latencyTotal / latencyCount : null,
      },
      rituals: {
        total: ritualIdList.length,
        active: ritualState.active,
        paused: ritualState.paused,
      },
      reviews: { revealedWeeks: (reviewWeeks ?? []).length },
      safeword: {
        total: sw.length,
        last30d: swLast30,
        lastTriggeredAt:
          typeof swLast === "number" ? swLast : null,
      },
      devices: { total: deviceIds.length, online: devicesOnline },
      activity: {
        last24h: typeof activity24h === "number" ? activity24h : 0,
      },
      generatedAt: now,
    };

    // Suppress unused-fixed-zero placeholders.
    void countPinT;
    void countPinB;

    return { stats };
  } catch (err) {
    logger.error("[admin] stats failed", err);
    return { error: "Stats failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Activity heatmap — per-day event counts over a window.
// ──────────────────────────────────────────────────────────────────

const HEATMAP_SOURCES = [
  { label: "notes", key: "notes:index" },
  { label: "ledger", key: "ledger:index" },
  { label: "permissions", key: "permissions:index" },
  { label: "tasks", key: "tasks:index" },
  { label: "rules", key: "rules:index" },
  { label: "milestones", key: "milestones:index" },
  { label: "rituals", key: "rituals:index" },
  { label: "reviews", key: "reviews:revealed" },
] as const;

export interface HeatmapDay {
  date: string;
  ts: number;
  count: number;
  bySource: Record<string, number>;
}

export interface HeatmapResult {
  days?: HeatmapDay[];
  windowDays?: number;
  generatedAt?: number;
  error?: string;
}

export async function getActivityHeatmap(
  windowDays = 30,
): Promise<HeatmapResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };
  const days = Math.max(7, Math.min(180, Math.floor(windowDays)));

  try {
    const now = Date.now();
    const dayStartMs = (ts: number) =>
      Math.floor(ts / 86_400_000) * 86_400_000;
    const todayStart = dayStartMs(now);
    const windowStart = todayStart - (days - 1) * 86_400_000;

    const buckets: HeatmapDay[] = [];
    for (let i = 0; i < days; i++) {
      const ts = windowStart + i * 86_400_000;
      buckets.push({
        date: new Date(ts).toISOString().slice(0, 10),
        ts,
        count: 0,
        bySource: {},
      });
    }
    const indexByTs = new Map(buckets.map((b) => [b.ts, b]));

    // Read every source's scored entries in the window in parallel.
    const reads = await Promise.all(
      HEATMAP_SOURCES.map((src) =>
        redis.zrange<unknown[]>(
          src.key,
          windowStart,
          now,
          { byScore: true },
        ),
      ),
    );

    for (let i = 0; i < HEATMAP_SOURCES.length; i++) {
      const src = HEATMAP_SOURCES[i];
      const members = (reads[i] ?? []) as unknown[];
      if (!members.length) continue;
      // To bucket we need scores; fetch them via zscore in a pipeline.
      const p = redis.pipeline();
      for (const m of members) p.zscore(src.key, String(m));
      const scores = (await p.exec<(number | string | null)[]>()) ?? [];
      for (let j = 0; j < members.length; j++) {
        const raw = scores[j];
        const score =
          typeof raw === "number" ? raw : Number(raw ?? 0);
        if (!Number.isFinite(score)) continue;
        const bucketTs = dayStartMs(score);
        const b = indexByTs.get(bucketTs);
        if (!b) continue;
        b.count++;
        b.bySource[src.label] = (b.bySource[src.label] ?? 0) + 1;
      }
    }

    return { days: buckets, windowDays: days, generatedAt: now };
  } catch (err) {
    logger.error("[admin] heatmap failed", err);
    return { error: "Heatmap failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Health snapshot + index repair.
// ──────────────────────────────────────────────────────────────────

export interface HealthSnapshot {
  redis: {
    ok: boolean;
    latencyMs: number | null;
  };
  fcm: {
    credentialsPresent: boolean;
    tokensRegistered: Record<Author, boolean>;
  };
  errorsLast24h: number;
  warningsLast24h: number;
  pinnedSetSize: number;
  countKeysVsIndex: {
    indexTotal: number;
    storedT7SEN: number;
    storedBesho: number;
    expectedT7SEN: number;
    expectedBesho: number;
    drift: number;
  };
  generatedAt: number;
}

export interface HealthResult {
  health?: HealthSnapshot;
  error?: string;
}

export async function getHealthSnapshot(): Promise<HealthResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  const now = Date.now();
  let redisOk = false;
  let redisLatency: number | null = null;
  try {
    const t0 = performance.now();
    await redis.get("__health_probe__");
    redisLatency = Math.round(performance.now() - t0);
    redisOk = true;
  } catch {
    redisOk = false;
  }

  const credsPresent = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  let tokensT = false;
  let tokensB = false;
  let errorsLast24h = 0;
  let warningsLast24h = 0;
  let pinnedSetSize = 0;
  let indexTotal = 0;
  let storedT = 0;
  let storedB = 0;
  let expectedT = 0;
  let expectedB = 0;
  try {
    const day1Ago = now - 86_400_000;
    const [tT, tB, pinned, indexIds, ctT, ctB] = await Promise.all([
      redis.get<string>("push:fcm:T7SEN"),
      redis.get<string>("push:fcm:Besho"),
      redis.smembers("notes:pinned"),
      redis.zrange<unknown[]>("notes:index", 0, -1),
      redis.get<number | string>("notes:count:T7SEN"),
      redis.get<number | string>("notes:count:Besho"),
    ]);
    tokensT = typeof tT === "string" && tT.length > 0;
    tokensB = typeof tB === "string" && tB.length > 0;
    pinnedSetSize = (pinned ?? []).length;
    const ids = (indexIds ?? []).map(String);
    indexTotal = ids.length;
    storedT = Number(ctT) || 0;
    storedB = Number(ctB) || 0;
    if (ids.length) {
      const recs =
        (await redis.mget<{ author?: string }[]>(
          ...ids.map((id) => `note:${id}`),
        )) ?? [];
      for (const r of recs) {
        if (r?.author === "T7SEN") expectedT++;
        else if (r?.author === "Besho") expectedB++;
      }
    }

    // Recent activity log severities.
    const recent =
      (await redis.zrange<unknown[]>(
        "activity:log",
        day1Ago,
        now,
        { byScore: true },
      )) ?? [];
    for (const v of recent) {
      let parsed: { level?: string } | null = null;
      if (typeof v === "string") {
        try {
          parsed = JSON.parse(v) as { level?: string };
        } catch {
          parsed = null;
        }
      } else if (v && typeof v === "object") {
        parsed = v as { level?: string };
      }
      if (!parsed) continue;
      if (parsed.level === "error" || parsed.level === "fatal")
        errorsLast24h++;
      else if (parsed.level === "warn") warningsLast24h++;
    }
  } catch (err) {
    logger.error("[admin] health probe partial failure", err);
  }

  const health: HealthSnapshot = {
    redis: { ok: redisOk, latencyMs: redisLatency },
    fcm: {
      credentialsPresent: credsPresent,
      tokensRegistered: { T7SEN: tokensT, Besho: tokensB },
    },
    errorsLast24h,
    warningsLast24h,
    pinnedSetSize,
    countKeysVsIndex: {
      indexTotal,
      storedT7SEN: storedT,
      storedBesho: storedB,
      expectedT7SEN: expectedT,
      expectedBesho: expectedB,
      drift:
        Math.abs(storedT - expectedT) + Math.abs(storedB - expectedB),
    },
    generatedAt: now,
  };
  return { health };
}

export interface RepairResult {
  success?: boolean;
  error?: string;
  repaired?: {
    countT7SEN: { before: number; after: number };
    countBesho: { before: number; after: number };
    pinnedRemoved: number;
  };
}

/**
 * Recompute `notes:count:{author}` from the actual note records in the
 * index, and prune `notes:pinned` set members whose underlying note
 * has gone away (e.g. after a manual purge that bypassed the helpers).
 */
export async function repairIndexes(): Promise<RepairResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  try {
    const [indexIds, beforeT, beforeB, pinnedMembers] = await Promise.all([
      redis.zrange<unknown[]>("notes:index", 0, -1),
      redis.get<number | string>("notes:count:T7SEN"),
      redis.get<number | string>("notes:count:Besho"),
      redis.smembers("notes:pinned"),
    ]);
    const ids = (indexIds ?? []).map(String);
    let nT = 0;
    let nB = 0;
    const existingIds = new Set<string>();
    if (ids.length) {
      const recs =
        (await redis.mget<{ author?: string }[]>(
          ...ids.map((id) => `note:${id}`),
        )) ?? [];
      for (let i = 0; i < ids.length; i++) {
        const r = recs[i];
        if (!r) continue;
        existingIds.add(ids[i]);
        if (r.author === "T7SEN") nT++;
        else if (r.author === "Besho") nB++;
      }
    }

    const stalePinned = (pinnedMembers ?? []).filter(
      (m) => !existingIds.has(String(m)),
    );

    const pipeline = redis.pipeline();
    pipeline.set("notes:count:T7SEN", nT);
    pipeline.set("notes:count:Besho", nB);
    if (stalePinned.length) {
      pipeline.srem("notes:pinned", ...(stalePinned as string[]));
    }
    await pipeline.exec();

    logger.interaction("[admin] indexes repaired", {
      by: guard.session.author,
      countT: { before: Number(beforeT) || 0, after: nT },
      countB: { before: Number(beforeB) || 0, after: nB },
      stalePinnedRemoved: stalePinned.length,
    });
    revalidatePath("/notes");
    revalidatePath("/admin/health");

    return {
      success: true,
      repaired: {
        countT7SEN: { before: Number(beforeT) || 0, after: nT },
        countBesho: { before: Number(beforeB) || 0, after: nB },
        pinnedRemoved: stalePinned.length,
      },
    };
  } catch (err) {
    logger.error("[admin] repair failed", err);
    return { error: "Repair failed." };
  }
}

// ──────────────────────────────────────────────────────────────────
// Devices — Sir-only enumeration of registered devices per author.
// ──────────────────────────────────────────────────────────────────

export interface DeviceListItem extends DeviceRecord {
  isOnline: boolean;
}

export interface ListDevicesResult {
  devices?: DeviceListItem[];
  generatedAt?: number;
  error?: string;
}

/**
 * Walk both per-author device ZSETs (newest-first), mget the records,
 * and decorate each with a runtime `isOnline` flag based on
 * `DEVICE_FRESH_MS`. Sir-only.
 */
export async function listDevices(): Promise<ListDevicesResult> {
  const guard = await requireSir();
  if (!guard.ok) return { error: guard.error };

  try {
    const [t7senIds, beshoIds] = await Promise.all([
      redis.zrange<unknown[]>("device:list:T7SEN", 0, -1, { rev: true }),
      redis.zrange<unknown[]>("device:list:Besho", 0, -1, { rev: true }),
    ]);
    const ids = [...(t7senIds ?? []), ...(beshoIds ?? [])].map(String);
    if (!ids.length) return { devices: [], generatedAt: Date.now() };

    const records =
      (await redis.mget<DeviceRecord[]>(
        ...ids.map((id) => `device:${id}`),
      )) ?? [];
    const now = Date.now();
    const devices: DeviceListItem[] = [];
    for (let i = 0; i < ids.length; i++) {
      const r = records[i];
      if (!r) continue;
      devices.push({
        ...r,
        isOnline: now - r.lastSeenAt < DEVICE_FRESH_MS,
      });
    }
    devices.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return { devices, generatedAt: now };
  } catch (err) {
    logger.error("[admin] device list failed", err);
    return { error: "Failed to load devices." };
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
