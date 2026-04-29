"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { logger } from "@/lib/logger";
import { vibrate } from "@/lib/haptic";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the catastrophic failure with the Next.js digest hash
    logger.fatal("Next.js Application Crash", error, { digest: error.digest });
    void vibrate([100, 50, 100, 50, 100], "heavy");
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 pb-24 pt-16">
      <div className="flex w-full max-w-md flex-col items-center space-y-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            System Glitch
          </h1>
          <p className="text-base font-medium text-muted-foreground">
            A critical error interrupted Our Space. A report has been filed.
          </p>
        </div>

        <button
          onClick={() => {
            void vibrate(50, "light");
            reset();
          }}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-bold text-primary-foreground transition-all hover:scale-105 active:scale-95"
        >
          <RotateCcw className="h-5 w-5" />
          Recover Session
        </button>
      </div>
    </div>
  );
}
