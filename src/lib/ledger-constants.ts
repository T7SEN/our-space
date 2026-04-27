export type LedgerEntryType = "reward" | "punishment";

export const REWARD_CATEGORIES = [
  "Obedience",
  "Devotion",
  "Effort",
  "Honesty",
  "Other",
] as const;

export const PUNISHMENT_CATEGORIES = [
  "Disobedience",
  "Attitude",
  "Neglect",
  "Dishonesty",
  "Other",
] as const;
