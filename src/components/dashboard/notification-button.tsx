"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";

// PushManager.subscribe() requires applicationServerKey as a Uint8Array.
// Passing the raw base64 string from NEXT_PUBLIC_VAPID_PUBLIC_KEY causes
// Chrome to throw DOMException silently. This conversion is the fix.
// new ArrayBuffer() is explicit so TS infers Uint8Array<ArrayBuffer>
// rather than Uint8Array<ArrayBufferLike>, satisfying the PushSubscriptionOptionsInit type.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationButton() {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const win = globalThis as unknown as {
      Notification?: { permission: "default" | "denied" | "granted" };
      navigator?: {
        serviceWorker?: {
          ready: Promise<{
            pushManager: {
              getSubscription: () => Promise<unknown>;
            };
          }>;
        };
      };
    };

    if (!win.Notification || !win.navigator?.serviceWorker) {
      return;
    }

    // 1. Defer synchronous state update to avoid cascading render warnings
    // while safely initializing client-only state post-hydration.
    Promise.resolve().then(() => {
      setPermission(win.Notification!.permission);
    });

    // 2. Asynchronously check for existing push subscriptions
    win.navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch((err) => console.error("Failed to get subscription:", err));
  }, []);

  // Don't render on unsupported platforms
  const win = globalThis as unknown as {
    Notification?: unknown;
    navigator?: { serviceWorker?: unknown };
    PushManager?: unknown;
  };

  if (!win.Notification || !win.navigator?.serviceWorker || !win.PushManager) {
    return null;
  }

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", { method: "DELETE" });
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("[push] Unsubscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const win = globalThis as unknown as {
        Notification: {
          requestPermission: () => Promise<"granted" | "denied" | "default">;
        };
      };

      const perm = await win.Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      setIsSubscribed(true);
    } catch (err) {
      console.error("[push] Subscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (permission === "denied") {
    return (
      <button
        disabled
        aria-label="Notifications blocked in browser settings"
        title="Notifications blocked"
        className="rounded-full p-2 text-muted-foreground/20"
      >
        <BellOff className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
      disabled={isLoading || undefined}
      aria-label={
        isSubscribed ? "Disable notifications" : "Enable notifications"
      }
      title={isSubscribed ? "Notifications on" : "Enable notifications"}
      className={cn(
        "rounded-full p-2 transition-all disabled:opacity-50",
        isSubscribed
          ? "text-primary hover:bg-primary/10"
          : "text-muted-foreground/30 hover:bg-muted/20 hover:text-muted-foreground",
      )}
    >
      {isSubscribed ? (
        <BellRing className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
    </button>
  );
}
