"use client";

import { MapPin, Navigation2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function DistanceCard() {
  const km = 520;
  const miles = Math.round(km * 0.621371);

  // We define the path string once so both the lines and the dot use the exact same math
  const flightPath = "M 0 35 Q 50 5 100 35";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden",
        "rounded-3xl border border-white/5 bg-card/40 p-8",
        "backdrop-blur-xl shadow-xl shadow-black/20 transition-colors",
        "hover:border-primary/20",
      )}
    >
      <div className="relative z-10 flex items-center justify-between">
        <h2
          className={cn(
            "text-xs font-bold uppercase tracking-[0.2em]",
            "text-muted-foreground",
          )}
        >
          Distance
        </h2>
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Navigation2 className="h-4 w-4" />
        </div>
      </div>

      <div className="relative z-10 mt-6">
        <div className="flex items-baseline gap-2">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-6xl font-black tracking-tighter"
          >
            {km}
          </motion.span>
          <span className="text-xl font-bold text-muted-foreground">km</span>
        </div>
        <p className="text-sm font-medium text-muted-foreground/60">
          {miles} miles away
        </p>
      </div>

      {/* Visual Connection Map */}
      <div className="relative mt-8 h-20 w-full rounded-2xl bg-black/20 p-4">
        <div className="flex h-full items-center justify-between px-2">
          {/* Shorouk Point */}
          <div className="flex flex-col items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/50">
              Shorouk
            </span>
          </div>

          {/* Connection Arc */}
          <div className="relative flex-1 px-4">
            {/* FIXED: Added a stable viewBox (0 0 100 40) and moved the dot 
						  inside the SVG to lock it mathematically to the path.
						*/}
            <svg
              viewBox="0 0 100 40"
              className="h-12 w-full overflow-visible"
              preserveAspectRatio="none"
            >
              {/* Background dashed path */}
              <motion.path
                d={flightPath}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                className="text-primary/30"
                vectorEffect="non-scaling-stroke"
              />
              {/* Solid animated path drawing in */}
              <motion.path
                d={flightPath}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-primary"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
              {/* The Indicator Dot. 
							  Using native <animateMotion> binds it directly to the SVG curve.
							*/}
              <circle
                r="2.5"
                fill="currentColor"
                className="text-primary drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
              >
                <animateMotion
                  dur="3s"
                  repeatCount="indefinite"
                  path={flightPath}
                />
              </circle>
            </svg>
          </div>

          {/* Tabuk Point */}
          <div className="flex flex-col items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-primary/50">
              Tabuk
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
