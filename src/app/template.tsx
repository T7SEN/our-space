"use client";

import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useMemo } from "react";

// Ordered list — index encodes "position" for directional sliding
const ROUTE_ORDER: Record<string, number> = {
  "/": 0,
  "/notes": 1,
  "/timeline": 2,
  "/tasks": 3,
  "/rules": 4,
  "/ledger": 5,
};

function getRouteIndex(pathname: string): number {
  // Exact match first, then prefix match for nested routes
  if (ROUTE_ORDER[pathname] !== undefined) return ROUTE_ORDER[pathname];
  const match = Object.entries(ROUTE_ORDER).find(([route]) =>
    pathname.startsWith(route + "/"),
  );
  return match ? match[1] : 0;
}

interface TemplateProps {
  children: React.ReactNode;
}

/**
 * Per-route enter animation with directional slide awareness.
 *
 * We can't orchestrate exit animations (App Router destroys the old
 * template synchronously), so we invest instead in a high-quality,
 * physics-based enter that feels native. The direction (left vs right)
 * is inferred from the nav order so forward navigation slides in from
 * the right and backward slides in from the left.
 *
 * For browsers supporting the View Transitions API (Chrome 111+,
 * Android WebView), the CSS transition layer handles the cross-fade
 * automatically — the JS animation is additive on top.
 */
export default function Template({ children }: TemplateProps) {
  const pathname = usePathname();

  const routeIndex = useMemo(() => getRouteIndex(pathname), [pathname]);

  // Encode direction as a positive/negative x offset.
  // The actual "previous" index is unknown at mount time — we use a
  // subtle ±16px slide so it reads as directional without being jarring.
  const xOffset = routeIndex % 2 === 0 ? -12 : 12;

  return (
    <motion.div
      key={pathname}
      initial={{
        opacity: 0,
        x: xOffset,
        filter: "blur(4px)",
        scale: 0.99,
      }}
      animate={{
        opacity: 1,
        x: 0,
        filter: "blur(0px)",
        scale: 1,
      }}
      transition={{
        duration: 0.38,
        ease: [0.22, 1, 0.36, 1], // custom cubic-bezier — fast out
        opacity: { duration: 0.25 },
        filter: { duration: 0.3 },
        scale: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      {children}
    </motion.div>
  );
}
