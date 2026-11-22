import type { Dataset } from "./types";
import { APP_CONFIG, databaseNameFor } from "@/lib/app-config";

// A fresh database name keeps this independent copy empty even if the Lovable
// template was previously opened in the same browser profile.
export const DB_NAME = databaseNameFor(APP_CONFIG.id);
const STORE = "kv";
const KEY = "dataset";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDataset(): Promise<Dataset | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { resolve((request.result as Dataset) ?? null); db.close(); };
  });
}

export async function saveDataset(ds: Dataset): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...ds, meta: { ...ds.meta, savedAt: new Date().toISOString() } }, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function seedDataset(): Promise<Dataset> {
  const mod = await import("@/data/atlas.json");
  return structuredClone((mod.default ?? mod) as unknown as Dataset);
}
