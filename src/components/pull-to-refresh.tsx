"use client";

import { useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export function PullToRefresh() {
  const handleRefresh = useCallback(async () => {
    const win = globalThis as unknown as {
      dispatchEvent: (e: Event) => void;
    };
    win.dispatchEvent(new CustomEvent("ourspace:refresh"));
    // Hold the spinner visible while pages fetch
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
  }, []);

  const { pullDistance, isRefreshing, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-60 flex justify-center"
      style={{
        transform: `translateY(${Math.max(pullDistance - 40, -40)}px)`,
        transition: isPulling ? "none" : "transform 0.3s ease",
      }}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          "border border-white/10 bg-card/80 shadow-lg backdrop-blur-sm",
          "transition-opacity duration-200",
          pullDistance > 20 ? "opacity-100" : "opacity-0",
        )}
      >
        {isRefreshing ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <RefreshCw
            className="h-4 w-4 text-primary"
            style={{
              transform: `rotate(${(pullDistance / 80) * 180}deg)`,
              opacity: Math.min(pullDistance / 80, 1),
              transition: isPulling ? "none" : "transform 0.3s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}
