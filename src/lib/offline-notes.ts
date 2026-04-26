/**
 * Lightweight IndexedDB wrapper for storing notes written while offline.
 * All functions are browser-only and must never be imported in server code.
 */

const DB_NAME = "our-space-offline";
const STORE_NAME = "pending-notes";
const DB_VERSION = 1;

export interface PendingNote {
  id: string;
  content: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Persist a note locally for later sync. Returns the generated note id. */
export async function storePendingNote(content: string): Promise<string> {
  const db = await openDB();
  const note: PendingNote = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content,
    createdAt: Date.now(),
  };
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).add(note);
    req.onsuccess = () => resolve(note.id);
    req.onerror = () => reject(req.error);
  });
}

/** Read all pending notes from IndexedDB. */
export async function getPendingNotes(): Promise<PendingNote[]> {
  const db = await openDB();
  return new Promise<PendingNote[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PendingNote[]);
    req.onerror = () => reject(req.error);
  });
}

/** Remove a successfully synced note. */
export async function removePendingNote(id: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
