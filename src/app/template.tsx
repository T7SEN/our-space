"use client";

import { motion } from "motion/react";

interface TemplateProps {
  children: React.ReactNode;
}

/**
 * Next.js App Router re-mounts this component on every navigation,
 * unlike layout.tsx which persists. This is the correct mechanism
 * for page-level enter/exit animations without any hacks.
 *
 * The exit animation is intentionally omitted: App Router unmounts
 * the old template and mounts the new one simultaneously; coordinating
 * exit + enter across route boundaries requires a router-level solution
 * (View Transitions API or a custom router). The enter-only approach
 * is smooth, correct, and avoids layout shift.
 */
export default function Template({ children }: TemplateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {children}
    </motion.div>
  );
}
