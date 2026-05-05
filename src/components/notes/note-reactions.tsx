// src/components/notes/note-reactions.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { reactToNote } from "@/app/actions/reactions";
import { REACTION_OPTIONS, type ReactionEmoji } from "@/lib/reaction-constants";
import { vibrate } from "@/lib/haptic";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NoteReactionsProps {
  noteId: string;
  reactions: Record<string, string>;
  currentAuthor: string | null;
  onReactionsChange: (reactions: Record<string, string>) => void;
}

function groupReactions(
  reactions: Record<string, string>,
): { emoji: string; label: string; count: number; authors: string[] }[] {
  const groups: Record<string, string[]> = {};
  for (const [author, emoji] of Object.entries(reactions)) {
    if (!groups[emoji]) groups[emoji] = [];
    groups[emoji].push(author);
  }
  return Object.entries(groups).map(([emoji, authors]) => ({
    emoji,
    label: REACTION_OPTIONS.find((r) => r.emoji === emoji)?.label ?? emoji,
    count: authors.length,
    authors,
  }));
}

/**
 * Computes the post-toggle state locally, mirroring the server-side
 * logic in `reactToNote`:
 *   - Same emoji as existing → remove the author's entry.
 *   - Different emoji → replace.
 *   - No existing → add.
 */
function applyToggle(
  reactions: Record<string, string>,
  author: string,
  emoji: string,
): Record<string, string> {
  const existing = reactions[author];
  const next = { ...reactions };
  if (existing === emoji) {
    delete next[author];
  } else {
    next[author] = emoji;
  }
  return next;
}

export function NoteReactions({
  noteId,
  reactions,
  currentAuthor,
  onReactionsChange,
}: NoteReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grouped = groupReactions(reactions);
  const myReaction = currentAuthor ? reactions[currentAuthor] : null;

  /**
   * Snapshot/rollback optimistic update — codebase pattern from
   * `references/coding-patterns.md` § "Optimistic UI with Snapshot
   * Rollback":
   *
   *   1. Snapshot current state (the `reactions` prop at tap time).
   *   2. Apply optimistic mutation locally via `onReactionsChange`.
   *   3. Call server.
   *   4. On error: rollback by re-applying the snapshot.
   *   5. On success: commit the authoritative server-returned state.
   *
   * `isSubmitting` blocks double-fires from the same tap (motion's
   * `whileTap` plus a delayed click could otherwise hit twice). The
   * pill `disabled={isSubmitting}` was intentionally REMOVED — the
   * optimistic update gives instant feedback regardless. Disabling
   * the pill defeated the purpose of going optimistic.
   *
   * Concurrency note: in the rare case of two near-simultaneous taps
   * for the same note, server-side `reactToNote` is read-then-write
   * non-atomically. At two-user scale with ~seconds-apart tap rates,
   * the race window is negligible. If it ever matters, a per-noteId
   * client-side promise queue would close it without server changes.
   */
  const handleReact = async (emoji: string) => {
    if (isSubmitting) return;
    if (!currentAuthor) return; // No author = server would reject anyway.

    void vibrate(50, "light");
    setShowPicker(false);

    // 1. Snapshot.
    const snapshot = reactions;
    // 2. Optimistic apply.
    const optimistic = applyToggle(reactions, currentAuthor, emoji);
    onReactionsChange(optimistic);

    setIsSubmitting(true);
    try {
      // 3. Server.
      const result = await reactToNote(noteId, emoji as ReactionEmoji);
      if (result.error) {
        // 4. Rollback on server-reported error.
        onReactionsChange(snapshot);
      } else {
        // 5. Commit authoritative state. Usually identical to
        //    `optimistic`; differs only if the server saw a
        //    concurrent change between snapshot and commit.
        onReactionsChange(result.reactions);
      }
    } catch {
      // 4. Rollback on network/transport error.
      onReactionsChange(snapshot);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {/* Existing reaction pills */}
      <AnimatePresence>
        {grouped.map(({ emoji, label, count, authors }) => {
          const isMyReaction = currentAuthor
            ? authors.includes(currentAuthor)
            : false;
          return (
            <Tooltip key={emoji} delayDuration={200}>
              <TooltipTrigger asChild>
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", bounce: 0.4, duration: 0.3 }}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1",
                    "border text-xs font-bold transition-all",
                    isMyReaction
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/30 bg-black/20 text-muted-foreground hover:border-primary/20",
                  )}
                >
                  <span>{emoji}</span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold",
                      isMyReaction
                        ? "text-primary/80"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {label}
                  </span>
                  {count > 1 && (
                    <span
                      className={cn(
                        "ml-0.5 text-[10px]",
                        isMyReaction
                          ? "text-primary/60"
                          : "text-muted-foreground/40",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="border-white/10 bg-black/80 text-[10px] backdrop-blur-md"
              >
                {authors.join(", ")}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </AnimatePresence>

      {/* Add reaction button */}
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => {
            void vibrate(30, "light");
            setShowPicker((v) => !v);
          }}
          aria-label="Add reaction"
          className={cn(
            "flex h-7 items-center gap-1 rounded-full border px-2.5",
            "text-[10px] font-bold uppercase tracking-wider transition-all",
            "border-border/30 bg-black/20 text-muted-foreground/50",
            "hover:border-primary/20 hover:text-primary/60",
            showPicker && "border-primary/30 bg-primary/10 text-primary/70",
          )}
        >
          {myReaction ? (
            <span>{myReaction}</span>
          ) : (
            <span className="text-base leading-none">+</span>
          )}
          <span>React</span>
        </motion.button>

        {/* Emoji picker popover */}
        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 4 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.25 }}
              className={cn(
                "absolute bottom-9 left-0 z-50 w-72 rounded-2xl border",
                "border-white/10 bg-card/95 p-3 shadow-xl shadow-black/30",
                "backdrop-blur-md",
              )}
            >
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                React
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {REACTION_OPTIONS.map((option) => (
                  <motion.button
                    key={option.emoji}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleReact(option.emoji)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-2.5 py-2",
                      "text-left transition-all hover:bg-primary/10",
                      myReaction === option.emoji &&
                        "bg-primary/15 ring-1 ring-primary/30",
                    )}
                  >
                    <span className="text-xl leading-none">{option.emoji}</span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold",
                        myReaction === option.emoji
                          ? "text-primary"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {option.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
