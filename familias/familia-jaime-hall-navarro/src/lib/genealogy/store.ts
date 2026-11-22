import type { Dataset } from "./types";
import { APP_CONFIG, databaseNameFor } from "@/lib/app-config";
import { PF1L_ROUTE_LINKS, PF1L_ROUTE_PERSONS, PF1L_ROUTE_UPDATE_ID } from "@/data/jaime-pf1l-route";

// A fresh database name keeps this independent copy empty even if the Lovable
// template was previously opened in the same browser profile.
export const DB_NAME = databaseNameFor(APP_CONFIG.id);
const STORE = "kv";
const KEY = "dataset";
export const PUBLISHED_UPDATE_ID = PF1L_ROUTE_UPDATE_ID;

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
  return applyPublishedUpdates(structuredClone((mod.default ?? mod) as unknown as Dataset));
}

/** Merge this release's additive route update into older browser databases without replacing local edits. */
export function applyPublishedUpdates(current: Dataset): Dataset {
  if ((current.meta.appliedUpdates ?? []).includes(PUBLISHED_UPDATE_ID)) return current;

  const next = structuredClone(current);
  const personIds = new Set(next.persons.map((person) => person.id));
  const addedIds = new Set<string>();
  for (const person of PF1L_ROUTE_PERSONS) {
    if (personIds.has(person.id)) continue;
    next.persons.push(structuredClone(person));
    personIds.add(person.id);
    addedIds.add(person.id);
  }

  const linkKeys = new Set(next.links.map((link) => `${link.child}>${link.parent}`));
  let addedLinks = 0;
  for (const link of PF1L_ROUTE_LINKS) {
    const key = `${link.child}>${link.parent}`;
    if (linkKeys.has(key)) continue;
    next.links.push(structuredClone(link));
    linkKeys.add(key);
    addedLinks++;
  }

  const applied = new Set(next.meta.appliedUpdates ?? []);
  applied.add(PUBLISHED_UPDATE_ID);
  next.meta.appliedUpdates = [...applied];

  const meta = next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> };
  const audit = meta.generationAudit;
  if (audit) {
    audit["sourcePersons"] ??= audit["totalPersons"];
    audit["sourceRelationships"] ??= audit["totalRelationships"];
    const increment = (field: string, amount: number) => {
      if (typeof audit[field] === "number") audit[field] = (audit[field] as number) + amount;
    };
    increment("totalPersons", addedIds.size);
    increment("includedPersons", addedIds.size);
    increment("directAncestorsExcludingRoot", addedIds.size);
    increment("ancestorsIncludingRoot", addedIds.size);
    increment("totalRelationships", addedLinks);
    increment("includedRelationships", addedLinks);
    increment("includedParentLinkRecords", addedLinks);
    audit["supplementalRoutePersons"] = (typeof audit["supplementalRoutePersons"] === "number" ? audit["supplementalRoutePersons"] as number : 0) + addedIds.size;
    audit["supplementalRouteRelationships"] = (typeof audit["supplementalRouteRelationships"] === "number" ? audit["supplementalRouteRelationships"] as number : 0) + addedLinks;
  }

  return next;
}

