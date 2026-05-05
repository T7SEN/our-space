"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional custom fallback. Defaults to a minimal error card that
   * matches the dashboard card aesthetic.
   */
  fallback?: React.ReactNode;
  /** Label shown in the default fallback — e.g. "Weather" */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("[ErrorBoundary]", error, {
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3",
          "rounded-3xl border border-destructive/20 bg-card/40 p-8",
          "backdrop-blur-md shadow-xl shadow-black/20",
        )}
      >
        <AlertTriangle className="h-6 w-6 text-destructive/50" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {this.props.label ?? "Widget"} unavailable
        </p>
      </div>
    );
  }
}
