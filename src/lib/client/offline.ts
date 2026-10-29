"use client";

/**
 * Offline recording queue (PRD 6.5).
 * When the connection drops, entries are held in IndexedDB and flushed the
 * moment the browser is back online. Nothing is lost and nothing is duplicated
 * (each entry carries a clientId used as the ingest key).
 */

export type QueuedEntry = {
  clientId: string;
  personId: string;
  transcript: string;
  lang: string;
  mode: string;
  durationS: number;
  acoustic?: Record<string, any>;
  queuedAt: string;
};

const DB_NAME = "docmate";
const STORE = "queue";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-idb"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(entry: QueuedEntry): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* queue is best-effort */
  }
}

export async function queued(): Promise<QueuedEntry[]> {
  try {
    const db = await open();
    const out = await new Promise<QueuedEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedEntry[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}

export async function remove(clientId: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(clientId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function queueSize(): Promise<number> {
  return (await queued()).length;
}

/** Try to push everything held. Returns how many went through. */
export async function flush(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const items = await queued();
  let sent = 0;
  for (const item of items) {
    try {
      const res = await fetch(`/api/v1/persons/${item.personId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: item.transcript,
          lang: item.lang,
          mode: item.mode,
          duration_s: item.durationS,
          clientId: item.clientId,
          acoustic: item.acoustic,
        }),
      });
      if (res.ok) {
        await remove(item.clientId);
        sent++;
      }
    } catch {
      break;
    }
  }
  return sent;
}

export function newClientId(): string {
  try {
    return `c_${crypto.randomUUID()}`;
  } catch {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
