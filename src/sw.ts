/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { logger } from "@/lib/logger";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ── Background Sync type — not yet in standard lib ────────────────────────────
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

// ── IndexedDB helpers (service worker context) ────────────────────────────────
const DB_NAME = "our-space-offline";
const STORE_NAME = "pending-notes";

function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = self.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllPending(
  db: IDBDatabase,
): Promise<{ id: string; content: string; createdAt: number }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () =>
      resolve(
        req.result as { id: string; content: string; createdAt: number }[],
      );
    req.onerror = () => reject(req.error);
  });
}

function deletePending(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Sync handler ──────────────────────────────────────────────────────────────

async function syncPendingNotes(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch (err) {
    logger.error("[sw/sync] Failed to open IndexedDB:", err);
    return;
  }

  const pending = await getAllPending(db);
  if (!pending.length) return;

  for (const note of pending) {
    try {
      const response = await fetch("/api/notes/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: note.id,
          content: note.content,
          createdAt: note.createdAt,
        }),
        credentials: "same-origin",
      });

      if (response.ok) {
        await deletePending(db, note.id);
        logger.info("[sw/sync] Synced offline note:", { id: note.id });
      } else {
        logger.warn("[sw/sync] Server rejected note:", {
          id: note.id,
          status: response.status,
        });
      }
    } catch (err) {
      logger.error("[sw/sync] Network error for note:", err, { id: note.id });
      // Leave in IndexedDB — will retry on next sync event
    }
  }
}

// ── Serwist ───────────────────────────────────────────────────────────────────

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  const syncEvent = event as unknown as SyncEvent;
  if (syncEvent.tag === "sync-notes") {
    syncEvent.waitUntil(syncPendingNotes());
  }
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  const data = (event as PushEvent).data?.json() ?? {};

  const promise = self.registration.showNotification(
    data.title ?? "Our Space",
    {
      body: data.body ?? "You have a new note",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: data.url ?? "/notes" },
    },
  );

  (event as ExtendableEvent).waitUntil(promise);
});

self.addEventListener("notificationclick", (event) => {
  const notifEvent = event as NotificationEvent;
  notifEvent.notification.close();

  const url: string = notifEvent.notification.data?.url ?? "/notes";

  notifEvent.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
