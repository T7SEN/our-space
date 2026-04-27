"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  /** Drag distance in px required to trigger refresh. Default: 80 */
  threshold?: number;
  enabled?: boolean;
}

export interface PullToRefreshState {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
}

type TouchLike = { touches: { clientY: number }[] };

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const startYRef = useRef(0);
  const pullRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const isPullingRef = useRef(false);

  const reset = useCallback(() => {
    pullRef.current = 0;
    isPullingRef.current = false;
    setTimeout(() => {
      setPullDistance(0);
      setIsPulling(false);
    }, 0);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    type Win = {
      scrollY: number;
      addEventListener: (
        type: string,
        fn: EventListener,
        opts?: AddEventListenerOptions,
      ) => void;
      removeEventListener: (type: string, fn: EventListener) => void;
    };

    const win = globalThis as unknown as Win;

    const handleTouchStart = (e: Event) => {
      const te = e as unknown as TouchLike;
      if (win.scrollY > 5) return;
      startYRef.current = te.touches[0].clientY;
    };

    const handleTouchMove = (e: Event) => {
      const te = e as unknown as TouchLike;
      if (win.scrollY > 5) return;
      if (isRefreshingRef.current) return;

      const distance = te.touches[0].clientY - startYRef.current;
      if (distance <= 0) return;

      const clamped = Math.min(distance, threshold * 1.5);
      pullRef.current = clamped;

      if (!isPullingRef.current) {
        isPullingRef.current = true;
        setTimeout(() => setIsPulling(true), 0);
      }

      setTimeout(() => setPullDistance(clamped), 0);
    };

    const handleTouchEnd = async () => {
      if (isRefreshingRef.current || pullRef.current < threshold) {
        reset();
        return;
      }

      isRefreshingRef.current = true;
      isPullingRef.current = false;
      pullRef.current = 0;

      setTimeout(() => {
        setIsPulling(false);
        setPullDistance(0);
        setIsRefreshing(true);
      }, 0);

      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        setTimeout(() => setIsRefreshing(false), 0);
      }
    };

    win.addEventListener("touchstart", handleTouchStart as EventListener, {
      passive: true,
    });
    win.addEventListener("touchmove", handleTouchMove as EventListener, {
      passive: true,
    });
    win.addEventListener(
      "touchend",
      handleTouchEnd as unknown as EventListener,
    );

    return () => {
      win.removeEventListener("touchstart", handleTouchStart as EventListener);
      win.removeEventListener("touchmove", handleTouchMove as EventListener);
      win.removeEventListener(
        "touchend",
        handleTouchEnd as unknown as EventListener,
      );
    };
  }, [enabled, threshold, onRefresh, reset]);

  return { pullDistance, isRefreshing, isPulling };
}
