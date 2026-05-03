// src/lib/review-constants.ts

export type ReviewAuthor = "T7SEN" | "Besho";

export type ReviewFieldKey =
  | "whatWorked"
  | "whatDidnt"
  | "friction"
  | "goalsNext";

export type ReviewFieldMode = "rich" | "plain";

export interface ReviewFieldMeta {
  key: ReviewFieldKey;
  label: string;
  prompt: string;
  placeholder: string;
  mode: ReviewFieldMode;
}

/**
 * Canonical field order for form, reveal-card, and history-drawer.
 * `mode` only affects the input surface — display is always rendered
 * through `MarkdownRenderer`, so plain-textarea fields still get GFM
 * if the writer happened to use it.
 */
export const REVIEW_FIELDS: readonly ReviewFieldMeta[] = [
  {
    key: "whatWorked",
    label: "What worked",
    prompt: "Wins, moments of connection, what made the week feel good.",
    placeholder: "Name the specific moments. Don't summarize.",
    mode: "rich",
  },
  {
    key: "whatDidnt",
    label: "What didn't",
    prompt: "Where the week fell short. Honest, not punishing.",
    placeholder: "The patterns, the unmet expectations, the misses.",
    mode: "rich",
  },
  {
    key: "friction",
    label: "Friction points",
    prompt: "Concrete frictions, one per line.",
    placeholder: "- ...\n- ...",
    mode: "plain",
  },
  {
    key: "goalsNext",
    label: "Goals for next week",
    prompt: "Concrete goals, one per line.",
    placeholder: "- ...\n- ...",
    mode: "plain",
  },
] as const;

export const MAX_FIELD_LENGTH = 4000;
export const HISTORY_PAGE_SIZE = 12;

/**
 * Persisted record. Keyed by `review:{weekDate}:{author}`.
 *
 * `weekDate` is the YYYY-MM-DD of the Sunday that started the reviewed
 * week (Cairo TZ). The reviewed period is `weekDate` Sun 00:00 →
 * (weekDate + 6 days) Sat 23:59:59.999 Cairo.
 *
 * `submittedAt` preserves the original submission ms across edits;
 * `editedAt` is updated on every pre-reveal edit. Once the week is
 * a member of `reviews:revealed`, the record is permanently locked
 * (server-enforced — UI is informational only).
 */
export interface ReviewRecord {
  weekDate: string;
  author: ReviewAuthor;
  whatWorked: string;
  whatDidnt: string;
  friction: string;
  goalsNext: string;
  submittedAt: number;
  editedAt?: number;
}

/**
 * Reveal envelope. Returned ONLY when the week is in `reviews:revealed`
 * and both author records exist. The server is the sole authority on
 * this gate; clients cannot bypass.
 */
export interface RevealedPair {
  weekDate: string;
  revealedAt: number;
  T7SEN: ReviewRecord;
  Besho: ReviewRecord;
}

/**
 * Aggregate of existing data for the reviewed week. Rendered in the
 * sidebar panel while writing and in the reveal-card after both
 * submitted. All counts scoped to the Cairo Sun→Sat window for
 * `weekDate`.
 *
 * Privacy-preserving deltas:
 *  - `permissions` is status counts only. Never carries
 *    `decidedByRuleId` or any auto-rule attribution. Holds for both
 *    authors — the Sir-private invariant stretches into summaries.
 *  - `safeword.timestamps` is empty for Besho. Both see `triggered`
 *    count (it's her own action, not new info to her). Sir
 *    additionally sees the timestamps.
 */
export interface WeekSummary {
  weekDate: string;
  range: { start: number; end: number };
  mood: {
    T7SEN: WeekMoodCell[];
    Besho: WeekMoodCell[];
  };
  hugs: {
    T7SEN: number;
    Besho: number;
  };
  rules: {
    created: number;
    acknowledged: number;
    completed: number;
  };
  tasks: {
    created: number;
    completed: number;
  };
  ledger: {
    rewards: number;
    punishments: number;
  };
  permissions: {
    submitted: number;
    approved: number;
    denied: number;
    queued: number;
    withdrawn: number;
  };
  notes: {
    total: number;
    T7SEN: number;
    Besho: number;
  };
  safeword: {
    triggered: number;
    /** T7SEN-only. Empty for Besho. */
    timestamps: number[];
  };
}

export interface WeekMoodCell {
  /** YYYY-MM-DD Cairo. */
  date: string;
  /** Daily mood emoji or null when unset / TTL-expired. */
  mood: string | null;
  /** Dom/sub state emoji or null. */
  state: string | null;
}

/**
 * Bundle returned by the page-level fetch. One round-trip covers
 * everything `/review` needs on initial render.
 */
export interface ReviewBundle {
  weekDate: string;
  withinWindow: boolean;
  /** Unix ms of the next window-open boundary, or null if currently open. */
  windowOpensAt: number | null;
  /** Unix ms of the closing boundary for this week's window. */
  windowClosesAt: number;
  revealed: RevealedPair | null;
  myRecord: ReviewRecord | null;
  partnerSubmitted: boolean;
  summary: WeekSummary;
}

/** Lightweight item for the history drawer. */
export interface RevealedHistoryItem {
  weekDate: string;
  revealedAt: number;
  /** Cached human-readable label, e.g. "Nov 2 – Nov 8". */
  label: string;
}
