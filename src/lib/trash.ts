// src/lib/trash.ts
import { Redis } from "@upstash/redis";
import type { Author } from "./constants";

export type TrashFeature =
  | "notes"
  | "rules"
  | "tasks"
  | "ledger"
  | "permissions"
  | "rituals"
  | "timeline"
  | "reviews";

export interface TrashEntry {
  feature: TrashFeature;
  /** Stable id for the record. Composite ids (reviews) are joined with `:`. */
  id: string;
  /** Human-readable label shown in the restore UI. */
  label: string;
  deletedAt: number;
  deletedBy: Author;
  /** The original record JSON (or `null` if the source was deleted before snapshot). */
  payload: unknown;
  /** Original score in the feature's index ZSET, used to re-add on restore. */
  indexScore: number;
  /** The Redis key that holds the record itself (e.g. `note:{id}`). */
  recordKey: string;
  /** The ZSET key the record was indexed in (e.g. `notes:index`). Empty for non-indexed. */
  indexKey: string;
  /**
   * Additional Redis STRING records that should be captured + restored
   * alongside the primary record. Used by features like reviews that
   * have a composite layout (one week → two per-author keys).
   */
  extraRecords?: { key: string; value: unknown }[];
}

const TTL_SECONDS = 7 * 24 * 60 * 60;
const GLOBAL_INDEX = "trash:index";

function featureIndexKey(feature: TrashFeature) {
  return `trash:index:${feature}`;
}
function entryKey(feature: TrashFeature, id: string) {
  return `trash:${feature}:${id}`;
}
function globalMember(feature: TrashFeature, id: string) {
  return `${feature}::${id}`;
}
function parseGlobalMember(
  member: string,
): { feature: TrashFeature; id: string } | null {
  const idx = member.indexOf("::");
  if (idx < 0) return null;
  return {
    feature: member.slice(0, idx) as TrashFeature,
    id: member.slice(idx + 2),
  };
}

export interface MoveToTrashOptions {
  feature: TrashFeature;
  id: string;
  label: string;
  deletedBy: Author;
  payload: unknown;
  indexScore: number;
  recordKey: string;
  indexKey: string;
  extraRecords?: { key: string; value: unknown }[];
}

/**
 * Append a record to the trash index. The record JSON gets a 7-day TTL;
 * the ZSET indexes are swept on read for entries whose JSON has expired.
 */
export async function moveToTrash(
  r: Redis,
  options: MoveToTrashOptions,
): Promise<void> {
  const at = Date.now();
  const entry: TrashEntry = {
    feature: options.feature,
    id: options.id,
    label: options.label,
    deletedAt: at,
    deletedBy: options.deletedBy,
    payload: options.payload,
    indexScore: options.indexScore,
    recordKey: options.recordKey,
    indexKey: options.indexKey,
    extraRecords: options.extraRecords,
  };
  await r
    .pipeline()
    .set(entryKey(options.feature, options.id), JSON.stringify(entry), {
      ex: TTL_SECONDS,
    })
    .zadd(GLOBAL_INDEX, {
      score: at,
      member: globalMember(options.feature, options.id),
    })
    .zadd(featureIndexKey(options.feature), {
      score: at,
      member: options.id,
    })
    .exec();
}

/**
 * Bulk variant for purges. Uses a single pipeline so 100 records is one
 * round-trip instead of 100. Skips entries with `payload === undefined`.
 */
export async function moveManyToTrash(
  r: Redis,
  entries: MoveToTrashOptions[],
): Promise<void> {
  if (!entries.length) return;
  const at = Date.now();
  const p = r.pipeline();
  for (const opts of entries) {
    if (opts.payload === undefined) continue;
    const entry: TrashEntry = {
      feature: opts.feature,
      id: opts.id,
      label: opts.label,
      deletedAt: at,
      deletedBy: opts.deletedBy,
      payload: opts.payload,
      indexScore: opts.indexScore,
      recordKey: opts.recordKey,
      indexKey: opts.indexKey,
      extraRecords: opts.extraRecords,
    };
    p.set(entryKey(opts.feature, opts.id), JSON.stringify(entry), {
      ex: TTL_SECONDS,
    });
    p.zadd(GLOBAL_INDEX, {
      score: at,
      member: globalMember(opts.feature, opts.id),
    });
    p.zadd(featureIndexKey(opts.feature), {
      score: at,
      member: opts.id,
    });
  }
  await p.exec();
}

export async function getTrashEntry(
  r: Redis,
  feature: TrashFeature,
  id: string,
): Promise<TrashEntry | null> {
  const raw = await r.get<TrashEntry | string>(entryKey(feature, id));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as TrashEntry) : raw;
}

/**
 * Re-hydrate a trash entry back to its original keys. The record JSON
 * is set verbatim and the index ZSET re-adds with the captured score.
 * After restore, the trash entry itself is deleted.
 */
export async function restoreFromTrash(
  r: Redis,
  feature: TrashFeature,
  id: string,
): Promise<TrashEntry | null> {
  const entry = await getTrashEntry(r, feature, id);
  if (!entry) return null;
  const hasPrimary =
    entry.recordKey &&
    entry.payload !== undefined &&
    entry.payload !== null;
  const hasExtras =
    !!entry.extraRecords &&
    entry.extraRecords.some(
      (e) => e.value !== undefined && e.value !== null,
    );

  const p = r.pipeline();
  if (hasPrimary) {
    p.set(entry.recordKey, JSON.stringify(entry.payload));
  }
  if (entry.extraRecords) {
    for (const er of entry.extraRecords) {
      if (er.value !== undefined && er.value !== null) {
        p.set(er.key, JSON.stringify(er.value));
      }
    }
  }
  // Only re-add to the index if at least one record was actually restored.
  // Without this guard, a payload-less trash entry would resurrect as a
  // tombstone (id in the index, no record at recordKey).
  if ((hasPrimary || hasExtras) && entry.indexKey) {
    p.zadd(entry.indexKey, { score: entry.indexScore, member: entry.id });
  }
  p.del(entryKey(feature, id));
  p.zrem(GLOBAL_INDEX, globalMember(feature, id));
  p.zrem(featureIndexKey(feature), id);
  await p.exec();
  return entry;
}

export interface ListTrashOptions {
  feature?: TrashFeature;
  limit?: number;
}

/**
 * Read the most-recently-deleted entries (newest first). Sweeps any
 * index members whose underlying JSON has expired.
 */
export async function listTrash(
  r: Redis,
  options: ListTrashOptions = {},
): Promise<TrashEntry[]> {
  const { feature, limit = 200 } = options;
  const indexKey = feature ? featureIndexKey(feature) : GLOBAL_INDEX;
  const members = ((await r.zrange<unknown[]>(indexKey, 0, limit - 1, {
    rev: true,
  })) ?? []) as unknown[];

  const ids: { feature: TrashFeature; id: string; member: string }[] = [];
  for (const m of members) {
    const memberStr = String(m);
    if (feature) {
      ids.push({ feature, id: memberStr, member: memberStr });
    } else {
      const parsed = parseGlobalMember(memberStr);
      if (parsed)
        ids.push({
          feature: parsed.feature,
          id: parsed.id,
          member: memberStr,
        });
    }
  }
  if (!ids.length) return [];

  const keys = ids.map((x) => entryKey(x.feature, x.id));
  const raw = (await r.mget<unknown[]>(...keys)) ?? [];
  const entries: TrashEntry[] = [];
  const sweep: { feature: TrashFeature; id: string; member: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const v = raw[i];
    if (v == null) {
      sweep.push(ids[i]);
      continue;
    }
    const entry: TrashEntry =
      typeof v === "string" ? (JSON.parse(v) as TrashEntry) : (v as TrashEntry);
    entries.push(entry);
  }

  if (sweep.length) {
    try {
      const p = r.pipeline();
      const globalMembers = sweep.map((s) =>
        feature ? globalMember(s.feature, s.id) : s.member,
      );
      if (globalMembers.length)
        p.zrem(GLOBAL_INDEX, ...globalMembers);
      const byFeature = new Map<TrashFeature, string[]>();
      for (const s of sweep) {
        const list = byFeature.get(s.feature) ?? [];
        list.push(s.id);
        byFeature.set(s.feature, list);
      }
      for (const [f, list] of byFeature) {
        if (list.length) p.zrem(featureIndexKey(f), ...list);
      }
      await p.exec();
    } catch {
      // sweep is best-effort
    }
  }

  return entries;
}

export async function deleteTrashEntry(
  r: Redis,
  feature: TrashFeature,
  id: string,
): Promise<void> {
  await r
    .pipeline()
    .del(entryKey(feature, id))
    .zrem(GLOBAL_INDEX, globalMember(feature, id))
    .zrem(featureIndexKey(feature), id)
    .exec();
}

/**
 * Permanently delete every trash entry, optionally scoped to a feature.
 * Returns the number of entries removed.
 */
export async function purgeTrash(
  r: Redis,
  feature?: TrashFeature,
): Promise<number> {
  if (feature) {
    const ids = ((await r.zrange<unknown[]>(featureIndexKey(feature), 0, -1)) ??
      []) as unknown[];
    if (!ids.length) {
      await r.del(featureIndexKey(feature));
      return 0;
    }
    const p = r.pipeline();
    const globalMembers: string[] = [];
    for (const m of ids) {
      const id = String(m);
      p.del(entryKey(feature, id));
      globalMembers.push(globalMember(feature, id));
    }
    if (globalMembers.length) p.zrem(GLOBAL_INDEX, ...globalMembers);
    p.del(featureIndexKey(feature));
    await p.exec();
    return ids.length;
  }

  const members = ((await r.zrange<unknown[]>(GLOBAL_INDEX, 0, -1)) ??
    []) as unknown[];
  if (!members.length) {
    await r.del(GLOBAL_INDEX);
    return 0;
  }
  const p = r.pipeline();
  const featuresHit = new Set<TrashFeature>();
  for (const m of members) {
    const parsed = parseGlobalMember(String(m));
    if (!parsed) continue;
    p.del(entryKey(parsed.feature, parsed.id));
    featuresHit.add(parsed.feature);
  }
  for (const f of featuresHit) p.del(featureIndexKey(f));
  p.del(GLOBAL_INDEX);
  await p.exec();
  return members.length;
}

export const TRASH_FEATURE_LABELS: Record<TrashFeature, string> = {
  notes: "Notes",
  rules: "Rules",
  tasks: "Tasks",
  ledger: "Ledger",
  permissions: "Permissions",
  rituals: "Rituals",
  timeline: "Timeline",
  reviews: "Review weeks",
};
